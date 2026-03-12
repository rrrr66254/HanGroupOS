"""
영상 생성 라우터 — HuggingFace Inference API + JSON2Video API
지원 모델: LTX-Video, CogVideoX, Text-to-Video-MS, JSON2Video 프레젠테이션
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List, Dict
from datetime import datetime
from pathlib import Path
import os

from core.database import get_db
from core.security import get_current_user, decode_token
from models.models import VideoJob, ExternalApiKey, User
from pydantic import BaseModel


# ── WebSocket 영상 진행률 관리자 ────────────────────────────────────────────

class VideoProgressManager:
    def __init__(self):
        self.connections: Dict[int, List[WebSocket]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._progress: Dict[int, dict] = {}

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def connect(self, job_id: int, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(job_id, []).append(ws)
        # 마지막 진행률 즉시 전송
        if job_id in self._progress:
            await ws.send_json(self._progress[job_id])

    def disconnect(self, job_id: int, ws: WebSocket):
        conns = self.connections.get(job_id, [])
        if ws in conns:
            conns.remove(ws)

    async def _broadcast(self, job_id: int, data: dict):
        dead = []
        for ws in list(self.connections.get(job_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(job_id, ws)

    def notify_sync(self, job_id: int, progress: int, message: str):
        """동기 스레드에서 호출 — WebSocket으로 진행률 브로드캐스트."""
        data = {"type": "progress", "job_id": job_id, "progress": progress, "message": message}
        self._progress[job_id] = data
        if not self._loop or self._loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(job_id, data), self._loop)
        except Exception:
            pass

    def done_sync(self, job_id: int, status: str):
        """완료/실패 알림 전송."""
        data = {"type": "done", "job_id": job_id, "status": status, "progress": 100}
        self._progress.pop(job_id, None)
        if not self._loop or self._loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(job_id, data), self._loop)
        except Exception:
            pass


video_progress = VideoProgressManager()

router = APIRouter(prefix="/api/video", tags=["video-generation"])

# 영상 저장 디렉토리
VIDEO_DIR = Path(os.path.expanduser("~")) / "han-video-store"
VIDEO_DIR.mkdir(exist_ok=True)

# FAL-AI 모델 ID 매핑
# - HuggingFace 모델 ID → fal-ai 앱 ID
# - fal-ai/ 로 시작하는 ID는 그대로 사용
FAL_MODEL_MAP: Dict[str, str] = {
    # LTX-Video 0.9.8-13B-distilled: 정식 text-to-video 엔드포인트
    "Lightricks/LTX-Video-0.9.8-13B-distilled": "fal-ai/ltxv-13b-098-distilled",
    "THUDM/CogVideoX-2b": "fal-ai/cogvideox-5b",
}

# 지원 모델 목록
SUPPORTED_MODELS = [
    # ── FAL-AI (권장) ───────────────────────────────────────────────────────
    {
        "id": "Lightricks/LTX-Video-0.9.8-13B-distilled",
        "label": "LTX-Video 0.9.8-13B Distilled (Lightricks) — 빠름, 고품질",
        "provider": "fal-ai",
        "recommended": True,
    },
    {
        "id": "fal-ai/hunyuan-video",
        "label": "Hunyuan Video (Tencent) — 고해상도, 영화적",
        "provider": "fal-ai",
        "recommended": False,
    },
    {
        "id": "fal-ai/wan/t2v-14b",
        "label": "Wan T2V 14B (Alibaba) — 다국어, 긴 영상",
        "provider": "fal-ai",
        "recommended": False,
    },
    {
        "id": "fal-ai/kling-video/v1.6/standard/text-to-video",
        "label": "Kling Video 1.6 (Kuaishou) — 인물·자연 특화",
        "provider": "fal-ai",
        "recommended": False,
    },
    {
        "id": "THUDM/CogVideoX-2b",
        "label": "CogVideoX-2B (ZhipuAI) — 오픈소스, 고품질",
        "provider": "fal-ai",
        "recommended": False,
    },
    # ── HuggingFace Inference API (무료 티어 가능, HF 토큰 필요) ────────────
    {
        "id": "tencent/HunyuanVideo",
        "label": "HunyuanVideo (Tencent) — 오픈소스, HF 무료 티어",
        "provider": "hf-inference",
        "recommended": False,
        "note": "HF Inference API warm 상태 — 무료 사용 가능 (속도 제한 있음)",
    },
    {
        "id": "genmo/mochi-1-preview",
        "label": "Mochi-1 Preview (Genmo) — 오픈소스, HF 무료 티어",
        "provider": "hf-inference",
        "recommended": False,
        "note": "HF Inference API warm 상태 — 자연스러운 움직임 특화",
    },
    # ── JSON2Video ───────────────────────────────────────────────────────────
    {
        "id": "json2video/presentation",
        "label": "JSON2Video — 프레젠테이션 영상 (무료 600초, 워터마크)",
        "provider": "json2video",
        "recommended": False,
    },
]


def _get_hf_token(db: Session) -> Optional[str]:
    """ExternalApiKey에서 HuggingFace 토큰 조회."""
    row = (
        db.query(ExternalApiKey)
        .filter(ExternalApiKey.service == "huggingface", ExternalApiKey.is_active == True)
        .first()
    )
    return row.api_key if row else None


def _get_fal_key(db: Session) -> Optional[str]:
    """ExternalApiKey에서 FAL-AI API 키 조회."""
    row = (
        db.query(ExternalApiKey)
        .filter(ExternalApiKey.service == "fal-ai", ExternalApiKey.is_active == True)
        .first()
    )
    return row.api_key if row else None


def _get_json2video_key(db: Session) -> Optional[str]:
    """ExternalApiKey에서 JSON2Video API 키 조회."""
    row = (
        db.query(ExternalApiKey)
        .filter(ExternalApiKey.service == "json2video", ExternalApiKey.is_active == True)
        .first()
    )
    return row.api_key if row else None


class VideoGenerateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    prompt: str
    model_id: str = "Lightricks/LTX-Video-0.9.8-13B-distilled"
    company_id: Optional[int] = None
    num_frames: Optional[int] = None       # 프레임 수 (모델마다 다름)
    fps: Optional[int] = None             # FPS
    meta: Optional[dict] = None           # json2video 템플릿 설정 등


class BatchDeleteRequest(BaseModel):
    ids: List[int]


class VideoJobOut(BaseModel):
    model_config = {"protected_namespaces": (), "from_attributes": True}

    id: int
    prompt: str
    model_id: str
    status: str
    video_url: Optional[str] = None
    error_msg: str
    created_at: str
    finished_at: Optional[str] = None


def _format_job(job: VideoJob, request_base: str = "") -> dict:
    video_url = None
    if job.status == "done" and job.video_path:
        if job.video_path.startswith("http"):
            video_url = job.video_path          # json2video 원격 URL
        else:
            video_url = f"/api/video/file/{job.id}"  # HF 로컬 파일
    return {
        "id": job.id,
        "company_id": job.company_id,
        "prompt": job.prompt,
        "model_id": job.model_id,
        "provider": job.provider,
        "status": job.status,
        "video_url": video_url,
        "error_msg": job.error_msg or "",
        "duration_sec": job.duration_sec,
        "created_at": job.created_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def _run_fal_generation(job_id: int, fal_key: str):
    """FAL-AI API로 영상 생성 (fal_client, 실시간 로그 진행률 지원)."""
    import os
    from core.database import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
        if not job:
            return

        job.status = "running"
        db.commit()
        video_progress.notify_sync(job_id, 5, "FAL-AI 큐 연결 중...")

        # HF 모델 ID → FAL 앱 ID 변환; 이미 fal-ai/ 형식이면 그대로 사용
        fal_app_id = FAL_MODEL_MAP.get(
            job.model_id,
            job.model_id if job.model_id.startswith("fal-ai/") else "fal-ai/ltx-video",
        )

        try:
            import fal_client

            os.environ["FAL_KEY"] = fal_key

            _progress_step = [10]  # mutable counter for closure

            def on_queue_update(update):
                if isinstance(update, fal_client.InProgress):
                    logs = getattr(update, "logs", []) or []
                    if logs:
                        msg = logs[-1].get("message", "처리 중...") if isinstance(logs[-1], dict) else str(logs[-1])
                        # 로그 개수에 따라 10~85% 선형 증가 (최대 85%는 파일 저장 전)
                        pct = min(10 + len(logs) * 3, 85)
                        _progress_step[0] = pct
                        video_progress.notify_sync(job_id, pct, msg[:100])
                    else:
                        video_progress.notify_sync(job_id, _progress_step[0], "모델 추론 중...")

            video_progress.notify_sync(job_id, 10, f"FAL-AI 모델 실행 중: {fal_app_id}")

            arguments: dict = {"prompt": job.prompt}
            if (job.meta or {}).get("num_frames"):
                arguments["num_frames"] = job.meta["num_frames"]

            result = fal_client.subscribe(
                fal_app_id,
                arguments=arguments,
                with_logs=True,
                on_queue_update=on_queue_update,
            )

            video_progress.notify_sync(job_id, 90, "영상 URL 확인 중...")

            # 결과에서 영상 URL 추출 (모델마다 다른 응답 형식 대응)
            video_url = None
            if isinstance(result, dict):
                # 우선순위: video.url → videos[0].url → video_url → url
                for key in ("video", "videos"):
                    val = result.get(key)
                    if not val:
                        continue
                    if isinstance(val, list):
                        val = val[0] if val else None
                    if isinstance(val, dict):
                        video_url = val.get("url") or val.get("video_url")
                    elif isinstance(val, str):
                        video_url = val
                    if video_url:
                        break
                if not video_url:
                    video_url = result.get("video_url") or result.get("url")

            if not video_url:
                raise ValueError(f"FAL-AI 결과에서 영상 URL을 찾을 수 없습니다: {str(result)[:200]}")

            job.status = "done"
            job.video_path = video_url
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "done")

        except ImportError:
            job.status = "failed"
            job.error_msg = "fal-client 패키지가 설치되지 않았습니다. pip install fal-client"
            video_progress.done_sync(job_id, "failed")
        except Exception as e:
            job.status = "failed"
            job.error_msg = str(e)[:500]
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "failed")

        db.commit()
        _notify_chat(db, job)

    finally:
        db.close()


def _run_generation(job_id: int, token: str):
    """백그라운드 영상 생성 실행."""
    from core.database import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
        if not job:
            return

        job.status = "running"
        db.commit()
        video_progress.notify_sync(job_id, 5, "모델 초기화 중...")

        try:
            from huggingface_hub import InferenceClient

            client = InferenceClient(token=token)
            video_progress.notify_sync(job_id, 15, f"HF Inference API 연결 중: {job.model_id}")

            # 영상 생성
            kwargs: dict = {}
            if job.meta and job.meta.get("num_frames"):
                kwargs["num_frames"] = job.meta["num_frames"]

            video_progress.notify_sync(job_id, 20, "영상 생성 중 (콜드 스타트 시 최대 3~5분)...")
            video_bytes = client.text_to_video(job.prompt, model=job.model_id, **kwargs)
            video_progress.notify_sync(job_id, 85, "영상 저장 중...")

            # 파일 저장 (bytes 또는 file-like 모두 처리)
            out_path = VIDEO_DIR / f"video_{job.id}.mp4"
            if isinstance(video_bytes, (bytes, bytearray)):
                out_path.write_bytes(video_bytes)
            elif hasattr(video_bytes, "read"):
                out_path.write_bytes(video_bytes.read())
            else:
                out_path.write_bytes(b"".join(video_bytes))

            job.status = "done"
            job.video_path = str(out_path)
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "done")

        except ImportError:
            job.status = "failed"
            job.error_msg = "huggingface_hub 패키지가 없습니다. 서버에서 han update를 실행하세요."
            video_progress.done_sync(job_id, "failed")
        except Exception as e:
            err = str(e)
            # HF Inference API 주요 오류 안내
            if "503" in err or "loading" in err.lower():
                err = f"모델 로딩 중 (콜드 스타트) — 잠시 후 재시도하세요. 원본: {err[:200]}"
            elif "401" in err or "authorization" in err.lower():
                err = "HuggingFace 토큰 인증 실패 — 관리자 → 외부 API 키에서 토큰을 재등록하세요."
            elif "404" in err or "not found" in err.lower():
                err = f"모델을 찾을 수 없거나 HF Inference API 미지원 모델입니다: {job.model_id}"
            elif "429" in err or "rate" in err.lower():
                err = "HF API 요청 한도 초과 — 잠시 후 재시도하거나 HF Pro를 이용하세요."
            job.status = "failed"
            job.error_msg = err[:500]
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "failed")

        db.commit()

        # 영상 생성 완료/실패 시 채팅 세션에 자동 알림 메시지 전송
        _notify_chat(db, job)

    finally:
        db.close()


def _run_json2video_generation(job_id: int, api_key: str):
    """json2video.com API로 프레젠테이션 영상 생성 (백그라운드)."""
    import requests
    import time
    from core.database import SessionLocal

    db = SessionLocal()
    try:
        job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
        if not job:
            return

        job.status = "running"
        db.commit()
        video_progress.notify_sync(job_id, 5, "JSON2Video API 연결 중...")

        try:
            # 프롬프트를 제목(첫 줄)과 부제목(나머지)으로 분리
            lines = job.prompt.strip().splitlines()
            title = lines[0][:120] if lines else job.prompt[:120]
            subtitle = " ".join(lines[1:])[:200] if len(lines) > 1 else ""

            # meta에서 템플릿 설정 읽기
            cfg = job.meta or {}
            template = cfg.get("template", "basic")
            logo = (cfg.get("logo") or "").strip()
            bg_image_url = (cfg.get("bgImageUrl") or "").strip()
            bgm = bool(cfg.get("bgm", False))

            if template == "corporate":
                scenes = []
                # 씬 1: 인트로 (로고 텍스트)
                if logo:
                    scenes.append({
                        "comment": "intro",
                        "duration": 3,
                        "elements": [
                            {"type": "text", "text": logo, "style": "center",
                             "font-size": 40, "font-color": "#A0B4FF",
                             "background": "#0d1117", "duration": 3}
                        ]
                    })
                # 씬 2: 타이틀
                title_elements = []
                if bg_image_url:
                    title_elements.append({"type": "image", "src": bg_image_url, "duration": 7})
                title_elements.append({"type": "text", "text": title, "style": "center",
                                        "font-size": 56, "font-color": "#FFFFFF", "duration": 7})
                scenes.append({"comment": "title", "duration": 7, "elements": title_elements})
                # 씬 3: 서브타이틀
                if subtitle:
                    scenes.append({
                        "comment": "subtitle", "duration": 5,
                        "elements": [
                            {"type": "text", "text": subtitle, "style": "center",
                             "font-size": 34, "font-color": "#C8D8FF",
                             "background": "#111827", "duration": 5}
                        ]
                    })

            elif template == "modern":
                elements = []
                if bg_image_url:
                    elements.append({"type": "image", "src": bg_image_url, "duration": 10})
                elements.append({"type": "text", "text": title, "style": "center",
                                  "font-size": 64, "font-color": "#FFFFFF",
                                  "background": "#000000", "duration": 10})
                if subtitle:
                    elements.append({"type": "text", "text": subtitle, "style": "lower-third",
                                      "font-size": 28, "font-color": "#AABBFF", "duration": 10})
                scenes = [{"comment": "main", "duration": 10, "elements": elements}]

            else:  # basic (기본형)
                scenes = [
                    {
                        "comment": "title",
                        "duration": 8,
                        "elements": [
                            {
                                "type": "text",
                                "text": title,
                                "style": "center",
                                "font-size": 60,
                                "font-color": "#FFFFFF",
                                "background": "#1a1a2e",
                                "duration": 8,
                            }
                        ],
                    }
                ]
                if subtitle:
                    scenes.append(
                        {
                            "comment": "subtitle",
                            "duration": 5,
                            "elements": [
                                {
                                    "type": "text",
                                    "text": subtitle,
                                    "style": "center",
                                    "font-size": 38,
                                    "font-color": "#CCDDFF",
                                    "background": "#16213e",
                                    "duration": 5,
                                }
                            ],
                        }
                    )

            payload: dict = {"resolution": "full-hd", "quality": 70, "scenes": scenes}
            if bgm:
                payload["audio"] = [{"type": "background-music", "volume": 0.3}]

            r = requests.post(
                "https://api.json2video.com/v2/movies",
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )
            r.raise_for_status()
            project_id = r.json().get("project")
            if not project_id:
                raise ValueError(f"project ID 없음: {r.text[:200]}")

            video_progress.notify_sync(job_id, 15, "렌더링 대기 중...")

            # 완료 폴링 — 최대 5분 (60회 × 5초)
            for poll_idx in range(60):
                time.sleep(5)
                sr = requests.get(
                    f"https://api.json2video.com/v2/movies?project={project_id}",
                    headers={"x-api-key": api_key},
                    timeout=30,
                )
                sr.raise_for_status()
                data = sr.json()
                st = data.get("status", "")
                # 진행률: 15% ~ 90% (폴링 횟수 기반)
                pct = 15 + int((poll_idx / 60) * 75)
                video_progress.notify_sync(job_id, pct, f"렌더링 중... ({poll_idx * 5}초 경과)")
                if st == "done":
                    movie = data.get("movie") or {}
                    video_url = movie.get("url") or data.get("url", "")
                    job.status = "done"
                    job.video_path = video_url
                    job.finished_at = datetime.utcnow()
                    video_progress.done_sync(job_id, "done")
                    break
                elif st == "error":
                    raise ValueError(data.get("message", "json2video 렌더링 오류"))
            else:
                raise TimeoutError("json2video 렌더링 시간 초과 (5분)")

        except Exception as e:
            job.status = "failed"
            job.error_msg = str(e)[:500]
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "failed")

        db.commit()
        _notify_chat(db, job)

    finally:
        db.close()


def _start_video_job(job_id: int, db: Session) -> bool:
    """provider에 따라 적절한 생성 함수를 백그라운드로 실행. 성공 여부 반환."""
    import threading

    job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
    if not job:
        return False

    provider = job.provider or "hf-inference"

    if provider == "json2video":
        api_key = _get_json2video_key(db)
        if not api_key:
            job.status = "failed"
            job.error_msg = "json2video API 키가 없습니다. 관리자 → 외부 API 키 탭에서 'json2video' 서비스로 등록하세요."
            db.commit()
            _notify_chat(db, job)
            return False
        t = threading.Thread(target=_run_json2video_generation, args=(job_id, api_key), daemon=True)

    elif provider == "fal-ai":
        fal_key = _get_fal_key(db)
        if fal_key:
            # FAL API 키가 있으면 fal_client 직접 사용 (실시간 진행률 지원)
            t = threading.Thread(target=_run_fal_generation, args=(job_id, fal_key), daemon=True)
        else:
            # FAL 키 없으면 HuggingFace Inference 폴백
            token = _get_hf_token(db)
            if not token:
                job.status = "failed"
                job.error_msg = (
                    "FAL-AI 또는 HuggingFace API 키가 없습니다. "
                    "관리자 → 외부 API 키 탭에서 'fal-ai' 서비스로 등록하세요. "
                    "(HuggingFace 키도 폴백으로 사용 가능)"
                )
                db.commit()
                _notify_chat(db, job)
                return False
            t = threading.Thread(target=_run_generation, args=(job_id, token), daemon=True)

    else:
        token = _get_hf_token(db)
        if not token:
            job.status = "failed"
            job.error_msg = "HuggingFace API 토큰이 없습니다. 관리자 → 외부 API 키 탭에서 'huggingface' 서비스로 등록하세요."
            db.commit()
            _notify_chat(db, job)
            return False
        t = threading.Thread(target=_run_generation, args=(job_id, token), daemon=True)

    t.start()
    return True


def _notify_chat(db, job):
    """VideoJob 완료/실패 후 채팅 알림 + DB 알림 생성."""
    # 채팅 세션 알림
    try:
        from models.models import ChatMessage
        session_id = (job.meta or {}).get("session_id")
        if session_id:
            if job.status == "done":
                text = (
                    f"🎬 **영상 생성 완료!** (작업 #{job.id})\n"
                    f"프롬프트: `{job.prompt[:80]}`\n"
                    f"영상 스튜디오에서 확인하고 다운로드하세요."
                )
            else:
                text = (
                    f"❌ **영상 생성 실패** (작업 #{job.id})\n"
                    f"오류: {job.error_msg[:200] if job.error_msg else '알 수 없는 오류'}"
                )
            msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=text,
                sender_name="AI CEO",
            )
            db.add(msg)
            db.commit()
    except Exception as e:
        print(f"[video_gen] 채팅 알림 실패 (무시): {e}")

    # DB 알림 생성 (NotificationPoller가 감지)
    try:
        from routers.notifications import create_notification
        if job.status == "done":
            create_notification(
                db,
                title=f"🎬 영상 생성 완료 (#{job.id})",
                body=f"프롬프트: {job.prompt[:80]}",
                notif_type="success",
                icon="🎬",
                company_id=job.company_id,
                link="/video-studio",
            )
        else:
            create_notification(
                db,
                title=f"❌ 영상 생성 실패 (#{job.id})",
                body=job.error_msg[:150] if job.error_msg else "알 수 없는 오류",
                notif_type="error",
                icon="❌",
                company_id=job.company_id,
            )
    except Exception as e:
        print(f"[video_gen] DB 알림 생성 실패 (무시): {e}")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.websocket("/ws/{job_id}")
async def video_progress_ws(
    job_id: int,
    websocket: WebSocket,
    token: str = Query(default=""),
):
    """영상 생성 진행률 실시간 WebSocket."""
    if not token or not decode_token(token):
        await websocket.close(code=4001)
        return

    video_progress.set_loop(asyncio.get_running_loop())
    await video_progress.connect(job_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        video_progress.disconnect(job_id, websocket)


@router.get("/stats")
def get_video_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """영상 잡 전체 통계."""
    from sqlalchemy import func

    total = db.query(VideoJob).count()

    status_rows = (
        db.query(VideoJob.status, func.count(VideoJob.id))
        .group_by(VideoJob.status)
        .all()
    )
    by_status: Dict[str, int] = {s: c for s, c in status_rows}

    model_rows = (
        db.query(VideoJob.model_id, func.count(VideoJob.id))
        .group_by(VideoJob.model_id)
        .order_by(func.count(VideoJob.id).desc())
        .limit(10)
        .all()
    )
    by_model: Dict[str, int] = {m: c for m, c in model_rows}

    provider_rows = (
        db.query(VideoJob.provider, func.count(VideoJob.id))
        .group_by(VideoJob.provider)
        .all()
    )
    by_provider: Dict[str, int] = {p: c for p, c in provider_rows}

    done_count = by_status.get("done", 0)
    failed_count = by_status.get("failed", 0)
    success_rate = round(done_count / max(total, 1) * 100, 1)

    # 완료된 잡의 평균 생성 시간 (finished_at - created_at)
    completed = (
        db.query(VideoJob.created_at, VideoJob.finished_at)
        .filter(VideoJob.status == "done", VideoJob.finished_at != None)
        .all()
    )
    if completed:
        durations = [
            (row.finished_at - row.created_at).total_seconds()
            for row in completed
            if row.finished_at and row.created_at
        ]
        avg_duration_sec = round(sum(durations) / len(durations)) if durations else None
    else:
        avg_duration_sec = None

    return {
        "total": total,
        "by_status": by_status,
        "by_model": by_model,
        "by_provider": by_provider,
        "done_count": done_count,
        "failed_count": failed_count,
        "success_rate": success_rate,
        "avg_duration_sec": avg_duration_sec,
    }


@router.get("/models")
def list_models():
    """지원 영상 생성 모델 목록."""
    return SUPPORTED_MODELS


@router.post("/generate")
def generate_video(
    req: VideoGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """영상 생성 요청 — provider에 따라 HuggingFace 또는 JSON2Video 백그라운드 실행."""
    model_info = next((m for m in SUPPORTED_MODELS if m["id"] == req.model_id), None)
    if not model_info:
        raise HTTPException(400, f"지원하지 않는 모델: {req.model_id}")

    provider = model_info["provider"]

    # API 키 사전 확인
    if provider == "json2video":
        if not _get_json2video_key(db):
            raise HTTPException(
                400,
                detail="JSON2Video API 키가 설정되지 않았습니다. "
                       "관리자 → API 키 관리에서 'json2video' 서비스로 등록하세요. "
                       "무료 키: https://json2video.com/get-api-key/",
            )
    elif provider == "fal-ai":
        if not _get_fal_key(db) and not _get_hf_token(db):
            raise HTTPException(
                400,
                detail="FAL-AI 또는 HuggingFace API 키가 필요합니다. "
                       "관리자 → API 키 관리에서 'fal-ai' 서비스(권장)로 등록하세요. "
                       "FAL-AI 키: https://fal.ai/dashboard/keys",
            )
    else:
        if not _get_hf_token(db):
            raise HTTPException(
                400,
                detail="HuggingFace API 토큰이 설정되지 않았습니다. "
                       "관리자 → API 키 관리에서 'huggingface' 서비스로 등록하세요.",
            )

    meta: dict = {}
    if req.num_frames:
        meta["num_frames"] = req.num_frames
    if req.meta:
        meta.update(req.meta)

    job = VideoJob(
        company_id=req.company_id,
        prompt=req.prompt,
        model_id=req.model_id,
        provider=provider,
        status="pending",
        meta=meta,
        created_by=current_user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    _start_video_job(job.id, db)
    return _format_job(job)


@router.get("/jobs")
def list_jobs(
    company_id: Optional[int] = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(VideoJob)
    if company_id:
        q = q.filter(VideoJob.company_id == company_id)
    jobs = q.order_by(VideoJob.created_at.desc()).limit(limit).all()
    return [_format_job(j) for j in jobs]


@router.get("/jobs/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return _format_job(job)


@router.post("/jobs/batch-delete")
def batch_delete_jobs(
    req: BatchDeleteRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """선택한 잡 일괄 삭제."""
    deleted = 0
    for job_id in req.ids:
        job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
        if not job:
            continue
        if job.video_path:
            p = Path(job.video_path)
            if p.exists():
                p.unlink(missing_ok=True)
        db.delete(job)
        deleted += 1
    db.commit()
    return {"ok": True, "deleted": deleted}


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Not found")
    # 파일 삭제
    if job.video_path:
        p = Path(job.video_path)
        if p.exists():
            p.unlink()
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.get("/file/{job_id}")
def download_video(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """생성된 영상 파일 다운로드/스트리밍."""
    job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
    if not job or job.status != "done" or not job.video_path:
        raise HTTPException(404, "영상 파일을 찾을 수 없습니다")
    p = Path(job.video_path)
    if not p.exists():
        raise HTTPException(404, "파일이 삭제되었습니다")
    return FileResponse(
        str(p),
        media_type="video/mp4",
        filename=f"video_{job.id}.mp4",
    )
