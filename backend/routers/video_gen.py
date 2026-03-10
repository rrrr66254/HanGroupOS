"""
영상 생성 라우터 — HuggingFace Inference API + JSON2Video API
지원 모델: LTX-Video, CogVideoX, Text-to-Video-MS, JSON2Video 프레젠테이션
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pathlib import Path
import os

from core.database import get_db
from core.security import get_current_user
from models.models import VideoJob, ExternalApiKey, User
from pydantic import BaseModel

router = APIRouter(prefix="/api/video", tags=["video-generation"])

# 영상 저장 디렉토리
VIDEO_DIR = Path(os.path.expanduser("~")) / "han-video-store"
VIDEO_DIR.mkdir(exist_ok=True)

# 지원 모델 목록
SUPPORTED_MODELS = [
    {
        "id": "Lightricks/LTX-Video-0.9.8-13B-distilled",
        "label": "LTX-Video (Lightricks) — 빠름, 고품질",
        "provider": "fal-ai",
        "recommended": True,
    },
    {
        "id": "ali-vilab/text-to-video-ms-1.7b",
        "label": "Text-to-Video MS 1.7B (ModelScope) — 경량",
        "provider": "hf-inference",
        "recommended": False,
    },
    {
        "id": "THUDM/CogVideoX-2b",
        "label": "CogVideoX-2B (ZhipuAI) — 고품질",
        "provider": "fal-ai",
        "recommended": False,
    },
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


def _get_json2video_key(db: Session) -> Optional[str]:
    """ExternalApiKey에서 JSON2Video API 키 조회."""
    row = (
        db.query(ExternalApiKey)
        .filter(ExternalApiKey.service == "json2video", ExternalApiKey.is_active == True)
        .first()
    )
    return row.api_key if row else None


class VideoGenerateRequest(BaseModel):
    prompt: str
    model_id: str = "Lightricks/LTX-Video-0.9.8-13B-distilled"
    company_id: Optional[int] = None
    num_frames: Optional[int] = None       # 프레임 수 (모델마다 다름)
    fps: Optional[int] = None             # FPS
    meta: Optional[dict] = None           # json2video 템플릿 설정 등


class VideoJobOut(BaseModel):
    id: int
    prompt: str
    model_id: str
    status: str
    video_url: Optional[str] = None
    error_msg: str
    created_at: str
    finished_at: Optional[str] = None

    class Config:
        from_attributes = True


def _format_job(job: VideoJob, request_base: str = "") -> dict:
    video_url = None
    if job.status == "done" and job.video_path:
        if job.video_path.startswith("http"):
            video_url = job.video_path          # json2video 원격 URL
        else:
            video_url = f"/api/video/file/{job.id}"  # HF 로컬 파일
    return {
        "id": job.id,
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

        # 모델 provider 확인
        model_info = next((m for m in SUPPORTED_MODELS if m["id"] == job.model_id), None)
        provider = (model_info or {}).get("provider", "hf-inference")

        try:
            from huggingface_hub import InferenceClient

            client = InferenceClient(api_key=token)

            # 영상 생성 (반환값: bytes)
            kwargs: dict = {"model": job.model_id}
            if job.meta.get("num_frames"):
                kwargs["num_frames"] = job.meta["num_frames"]

            video_bytes = client.text_to_video(job.prompt, **kwargs)

            # 파일 저장
            out_path = VIDEO_DIR / f"video_{job.id}.mp4"
            if isinstance(video_bytes, bytes):
                out_path.write_bytes(video_bytes)
            else:
                # huggingface_hub >= 0.27 returns a generator or file-like
                data = b"".join(video_bytes) if hasattr(video_bytes, "__iter__") else bytes(video_bytes)
                out_path.write_bytes(data)

            job.status = "done"
            job.video_path = str(out_path)
            job.finished_at = datetime.utcnow()

        except ImportError:
            job.status = "failed"
            job.error_msg = "huggingface_hub 패키지가 설치되지 않았습니다. pip install huggingface_hub"
        except Exception as e:
            job.status = "failed"
            job.error_msg = str(e)[:500]
            job.finished_at = datetime.utcnow()

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

            # 완료 폴링 — 최대 5분 (60회 × 5초)
            for _ in range(60):
                time.sleep(5)
                sr = requests.get(
                    f"https://api.json2video.com/v2/movies?project={project_id}",
                    headers={"x-api-key": api_key},
                    timeout=30,
                )
                sr.raise_for_status()
                data = sr.json()
                st = data.get("status", "")
                if st == "done":
                    movie = data.get("movie") or {}
                    video_url = movie.get("url") or data.get("url", "")
                    job.status = "done"
                    job.video_path = video_url
                    job.finished_at = datetime.utcnow()
                    break
                elif st == "error":
                    raise ValueError(data.get("message", "json2video 렌더링 오류"))
            else:
                raise TimeoutError("json2video 렌더링 시간 초과 (5분)")

        except Exception as e:
            job.status = "failed"
            job.error_msg = str(e)[:500]
            job.finished_at = datetime.utcnow()

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
