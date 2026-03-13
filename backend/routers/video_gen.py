"""
영상 생성 라우터 — HuggingFace Inference API + JSON2Video API
지원 모델: LTX-Video, CogVideoX, Text-to-Video-MS, JSON2Video 프레젠테이션
"""
import asyncio
import threading
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List, Dict
from datetime import datetime
from pathlib import Path
import os
from core.logging import get_logger

logger = get_logger("router.video_gen")

# ── 공유 리소스 잠금 ──────────────────────────────────────────────────────────
# 영상 생성(diffusers)과 Ollama pull이 동시에 실행되지 않도록 직렬화합니다.
# - 영상 생성: _GPU_LOCK 획득 후 실행
# - Ollama pull: _GPU_LOCK 획득 후 다운로드 (동시 VRAM/대역폭 충돌 방지)
_GPU_LOCK = threading.Lock()          # 공유 리소스 잠금 (video gen + pull 직렬화)
_GPU_JOB_QUEUE: list = []            # 대기 중인 video job_id 목록 (UI 표시용)
_GPU_LOCK_MUTEX = threading.Lock()   # _GPU_JOB_QUEUE 보호용

# ── Ollama Pull 큐 + 진행 상태 ────────────────────────────────────────────────
# 페이지 이동 후 재접속해도 진행률 복원 가능하도록 서버 상태 유지
_PULL_QUEUE_LIST: List[str] = []          # 다운로드 대기 중인 모델 이름 목록
_PULL_QUEUE_MUTEX = threading.Lock()      # _PULL_QUEUE_LIST 보호용
_PULL_PROGRESS: Dict[str, dict] = {}     # model → 최신 progress dict (WS 재연결 시 즉시 전송)
_PULL_SUBSCRIBERS: Dict[str, list] = {}  # model → [asyncio.Queue, ...] (WS 브로드캐스트)
_PULL_EVENT_LOOP = None                  # pull 워커 스레드에서 asyncio 전송용
_PULL_CANCEL_FLAGS: Dict[str, bool] = {} # model → True이면 취소 요청됨


def _broadcast_pull(model: str, data: dict) -> None:
    """Pull 진행 상태를 _PULL_PROGRESS에 저장하고 모든 WS 구독자에게 전송."""
    _PULL_PROGRESS[model] = data
    loop = _PULL_EVENT_LOOP
    if not loop or loop.is_closed():
        return
    for q in list(_PULL_SUBSCRIBERS.get(model, [])):
        try:
            asyncio.run_coroutine_threadsafe(q.put(data), loop)
        except Exception as e:
            logger.debug("WS broadcast 실패: %s", e)


def _pull_worker(model: str) -> None:
    """백그라운드 스레드: _GPU_LOCK을 획득한 후 Ollama pull 실행."""
    import httpx as _httpx, json as _json

    # 취소 플래그 초기화
    _PULL_CANCEL_FLAGS[model] = False

    # 큐에 추가 & 대기 상태 브로드캐스트
    with _PULL_QUEUE_MUTEX:
        _PULL_QUEUE_LIST.append(model)

    queue_pos = _PULL_QUEUE_LIST.index(model)
    if queue_pos > 0:
        _broadcast_pull(model, {
            "type": "queued",
            "status": f"대기 중... (앞에 {queue_pos}개 작업 진행 중)",
            "pct": 0,
            "queue_pos": queue_pos,
        })

    # 앞선 작업(영상 생성 or 다른 pull)이 끝날 때까지 블로킹
    # GPU 잠금 획득 대기 중에도 취소 요청을 처리하기 위해 타임아웃 폴링 방식 사용
    while True:
        if _PULL_CANCEL_FLAGS.get(model, False):
            with _PULL_QUEUE_MUTEX:
                if model in _PULL_QUEUE_LIST:
                    _PULL_QUEUE_LIST.remove(model)
            _broadcast_pull(model, {"type": "cancelled", "status": "다운로드가 취소되었습니다.", "pct": 0})
            _PULL_CANCEL_FLAGS.pop(model, None)
            return
        acquired = _GPU_LOCK.acquire(timeout=1.0)
        if acquired:
            break

    with _PULL_QUEUE_MUTEX:
        if model in _PULL_QUEUE_LIST:
            _PULL_QUEUE_LIST.remove(model)

    try:
        # GPU 잠금 획득 후에도 취소 확인
        if _PULL_CANCEL_FLAGS.get(model, False):
            _broadcast_pull(model, {"type": "cancelled", "status": "다운로드가 취소되었습니다.", "pct": 0})
            return

        _broadcast_pull(model, {"type": "progress", "status": "다운로드 준비 중...", "pct": 0})
        with _httpx.stream(
            "POST",
            "http://localhost:11434/api/pull",
            json={"name": model, "stream": True},
            timeout=None,
        ) as resp:
            if resp.status_code != 200:
                _broadcast_pull(model, {"type": "error", "status": f"Ollama 오류: {resp.status_code}"})
                return
            for line in resp.iter_lines():
                # 취소 요청 확인 — 즉시 스트림 중단
                if _PULL_CANCEL_FLAGS.get(model, False):
                    _broadcast_pull(model, {"type": "cancelled", "status": "다운로드가 취소되었습니다.", "pct": 0})
                    return
                if not line.strip():
                    continue
                try:
                    data = _json.loads(line)
                except Exception as e:
                    logger.debug("Pull JSON 파싱 실패: %s", e)
                    continue
                status_str = data.get("status", "")
                completed = data.get("completed", 0)
                total = data.get("total", 0)
                pct = round(completed / total * 100, 1) if total > 0 else 0
                msg: dict = {
                    "type": "progress",
                    "status": status_str,
                    "pct": pct,
                    "completed": completed,
                    "total": total,
                }
                if status_str == "success":
                    msg["type"] = "done"
                    _broadcast_pull(model, msg)
                    return
                _broadcast_pull(model, msg)
    except Exception as e:
        _broadcast_pull(model, {"type": "error", "status": str(e)[:200]})
    finally:
        _PULL_CANCEL_FLAGS.pop(model, None)
        _GPU_LOCK.release()  # 다음 작업 허용


def _ollama_unload(base_url: str = "http://localhost:11434") -> None:
    """Ollama에게 현재 모델을 VRAM에서 내리도록 요청 (keep_alive=0)."""
    try:
        import httpx
        from core.config import settings
        model = getattr(settings, "OLLAMA_MODEL", "")
        if not model:
            return
        httpx.post(
            f"{base_url}/api/generate",
            json={"model": model, "keep_alive": 0},
            timeout=5.0,
        )
    except Exception as e:
        logger.debug("Ollama 미실행: %s", e)


def _ollama_warmup(base_url: str = "http://localhost:11434") -> None:
    """영상 생성 완료 후 Ollama 모델을 VRAM에 미리 로드 (keep_alive=300s).
    백그라운드 스레드에서 호출 — 다음 LLM 요청 응답 지연 최소화."""
    try:
        import httpx
        from core.config import settings
        model = getattr(settings, "OLLAMA_MODEL", "")
        if not model:
            return
        httpx.post(
            f"{base_url}/api/generate",
            json={"model": model, "keep_alive": 300, "prompt": ""},
            timeout=30.0,
        )
    except Exception as e:
        logger.debug("Ollama warmup 실패: %s", e)


def _get_free_vram_gb() -> float:
    """nvidia-smi로 현재 GPU 여유 VRAM(GB) 반환. 실패 시 0 반환."""
    try:
        import subprocess
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            timeout=5,
        ).decode().strip().splitlines()[0]
        return int(out.strip()) / 1024
    except Exception as e:
        logger.debug("VRAM 조회 실패: %s", e)
        return 0.0

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
            except Exception as e:
                logger.debug("WS dead connection: %s", e)
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
        except Exception as e:
            logger.debug("WS notify_sync 실패: %s", e)

    def done_sync(self, job_id: int, status: str):
        """완료/실패 알림 전송."""
        data = {"type": "done", "job_id": job_id, "status": status, "progress": 100}
        self._progress.pop(job_id, None)
        if not self._loop or self._loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(job_id, data), self._loop)
        except Exception as e:
            logger.debug("WS done_sync 실패: %s", e)


video_progress = VideoProgressManager()

router = APIRouter(prefix="/api/video", tags=["video-generation"])

# 영상 저장 디렉토리
VIDEO_DIR = Path(os.path.expanduser("~")) / "han-video-store"
VIDEO_DIR.mkdir(exist_ok=True)

# 이미지 업로드 디렉토리
IMAGE_DIR = VIDEO_DIR / "images"
IMAGE_DIR.mkdir(exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB

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
    # ── Local GPU (RTX 5070 Ti / CUDA) ──────────────────────────────────────
    # han setup-gpu 실행 후 사용 가능. API 키 불필요, 완전 무료.
    {
        "id": "local/ltx-video",
        "label": "LTX-Video (로컬 GPU) — 빠른 추론, VRAM 6GB+",
        "provider": "local-gpu",
        "recommended": False,
        "vram_gb": 6,
        "hf_id": "Lightricks/LTX-Video",
    },
    {
        "id": "local/wan-1.3b",
        "label": "Wan 2.1 1.3B (로컬 GPU) — 균형, VRAM 8GB+",
        "provider": "local-gpu",
        "recommended": False,
        "vram_gb": 8,
        "hf_id": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
    },
    {
        "id": "local/cogvideox-2b",
        "label": "CogVideoX-2B (로컬 GPU) — 고품질, VRAM 12GB+",
        "provider": "local-gpu",
        "recommended": False,
        "vram_gb": 12,
        "hf_id": "THUDM/CogVideoX-2b",
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
    from core.utils import get_active_api_key
    row = get_active_api_key(db, "huggingface")
    return row.api_key if row else None


def _get_fal_key(db: Session) -> Optional[str]:
    """ExternalApiKey에서 FAL-AI API 키 조회."""
    from core.utils import get_active_api_key
    row = get_active_api_key(db, "fal-ai")
    return row.api_key if row else None


def _get_json2video_key(db: Session) -> Optional[str]:
    """ExternalApiKey에서 JSON2Video API 키 조회."""
    from core.utils import get_active_api_key
    row = get_active_api_key(db, "json2video")
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
        "created_at": job.created_at.isoformat() + "Z",
        "finished_at": (job.finished_at.isoformat() + "Z") if job.finished_at else None,
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

            # provider="hf-inference": HF 자체 서버 강제 (FAL 등 외부 유료 제공자 라우팅 방지)
            client = InferenceClient(token=token, provider="hf-inference")
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
            elif "402" in err or "payment" in err.lower() or "credits" in err.lower():
                err = (
                    "HF Inference API가 이 모델을 유료 외부 제공자(FAL 등)로 라우팅했습니다 (402 Payment Required). "
                    "JSON2Video(무료) 또는 FAL-AI(fal.ai 유료) 모델을 사용하세요."
                )
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


def _run_local_gpu_generation(job_id: int):
    """로컬 GPU (diffusers)로 영상 생성 — RTX 5070 Ti / CUDA."""
    from core.database import SessionLocal

    # ── GPU 직렬 큐잉: 다른 GPU 작업이 끝날 때까지 대기 ─────────────────────
    with _GPU_LOCK_MUTEX:
        _GPU_JOB_QUEUE.append(job_id)

    queue_pos = _GPU_JOB_QUEUE.index(job_id)
    if queue_pos > 0:
        db_q = SessionLocal()
        try:
            job_q = db_q.query(VideoJob).filter(VideoJob.id == job_id).first()
            if job_q:
                video_progress.notify_sync(job_id, 0, f"GPU 대기 중... ({queue_pos}개 작업 선행)")
        finally:
            db_q.close()

    # 이전 GPU 작업이 완료될 때까지 블로킹
    _GPU_LOCK.acquire()
    with _GPU_LOCK_MUTEX:
        if job_id in _GPU_JOB_QUEUE:
            _GPU_JOB_QUEUE.remove(job_id)
    # ─────────────────────────────────────────────────────────────────────────

    db = SessionLocal()
    try:
        job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
        if not job:
            _GPU_LOCK.release()
            return

        job.status = "running"
        db.commit()
        video_progress.notify_sync(job_id, 3, "GPU 및 패키지 점검 중...")

        try:
            import torch
            import importlib

            if not torch.cuda.is_available():
                raise RuntimeError(
                    "CUDA를 사용할 수 없습니다. "
                    "NVIDIA 드라이버와 PyTorch CUDA 버전을 확인하세요. "
                    "han setup-gpu 를 실행하면 자동으로 설치됩니다."
                )

            device = "cuda"
            vram_total_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            gpu_name = torch.cuda.get_device_name(0)
            video_progress.notify_sync(job_id, 4, f"GPU: {gpu_name} ({vram_total_gb:.1f}GB) — Ollama VRAM 해제 중...")

            # Ollama 모델을 VRAM에서 언로드 → diffusers 확보
            _ollama_unload()
            torch.cuda.empty_cache()
            import time as _time; _time.sleep(1)  # 언로드 완료 대기

            free_vram = _get_free_vram_gb()
            vram_gb = vram_total_gb  # 모델 cfg 비교용은 총 VRAM 사용
            video_progress.notify_sync(job_id, 5, f"GPU: {gpu_name} ({vram_total_gb:.1f}GB 총 / {free_vram:.1f}GB 여유)")

            # 모델별 파이프라인 설정
            model_cfg = {
                "local/ltx-video": {
                    "hf_id": "Lightricks/LTX-Video",
                    "pipeline_cls": "LTXPipeline",
                    "module": "diffusers",
                    "dtype": torch.bfloat16,
                    "num_frames": 121,
                    "fps": 24,
                    "min_vram": 6,
                },
                "local/wan-1.3b": {
                    "hf_id": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
                    "pipeline_cls": "AutoPipelineForText2Video",
                    "module": "diffusers",
                    "dtype": torch.float16,
                    "num_frames": 81,
                    "fps": 16,
                    "min_vram": 8,
                },
                "local/cogvideox-2b": {
                    "hf_id": "THUDM/CogVideoX-2b",
                    "pipeline_cls": "CogVideoXPipeline",
                    "module": "diffusers",
                    "dtype": torch.float16,
                    "num_frames": 49,
                    "fps": 8,
                    "min_vram": 10,
                },
            }

            cfg = model_cfg.get(job.model_id)
            if not cfg:
                raise ValueError(f"알 수 없는 로컬 모델: {job.model_id}")

            if vram_gb < cfg["min_vram"]:
                raise RuntimeError(
                    f"VRAM 부족: {vram_gb:.1f}GB (필요: {cfg['min_vram']}GB+). "
                    f"다른 모델을 선택하거나 다른 앱을 종료 후 재시도하세요."
                )

            diffusers_mod = importlib.import_module(cfg["module"])
            PipelineCls = getattr(diffusers_mod, cfg["pipeline_cls"])

            video_progress.notify_sync(job_id, 10, f"모델 로딩 중: {cfg['hf_id']} (최초 실행 시 수 분 소요)")

            pipe = PipelineCls.from_pretrained(cfg["hf_id"], torch_dtype=cfg["dtype"])
            pipe = pipe.to(device)

            # VRAM 최적화
            if hasattr(pipe, "enable_model_cpu_offload"):
                pass  # to(device)로 충분히 VRAM 확보 시 오프로드 불필요
            if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_slicing"):
                pipe.vae.enable_slicing()
            if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
                pipe.vae.enable_tiling()

            num_frames = (job.meta or {}).get("num_frames") or cfg["num_frames"]
            num_steps = (job.meta or {}).get("num_steps") or 30

            # 진행률 콜백
            step_total = [num_steps]

            def progress_cb(pipe_obj, step_idx, timestep, callback_kwargs):
                pct = 20 + int((step_idx / step_total[0]) * 65)
                video_progress.notify_sync(job_id, pct, f"추론 중... {step_idx}/{step_total[0]} 스텝")
                return callback_kwargs

            video_progress.notify_sync(job_id, 20, "영상 생성 시작...")

            result = pipe(
                prompt=job.prompt,
                num_frames=num_frames,
                num_inference_steps=num_steps,
                callback_on_step_end=progress_cb,
            )
            frames = result.frames[0]

            video_progress.notify_sync(job_id, 88, "영상 저장 중...")

            out_path = VIDEO_DIR / f"video_{job.id}.mp4"
            from diffusers.utils import export_to_video
            export_to_video(frames, str(out_path), fps=cfg["fps"])

            # 메모리 해제
            del pipe
            torch.cuda.empty_cache()

            job.status = "done"
            job.video_path = str(out_path)
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "done")

            # Ollama 워밍업 — 백그라운드로 모델 VRAM 재로드 (다음 LLM 응답 지연 방지)
            threading.Thread(target=_ollama_warmup, daemon=True).start()

        except ImportError as e:
            missing = str(e).replace("No module named ", "").strip("'\"")
            job.status = "failed"
            job.error_msg = (
                f"필수 패키지 미설치: {missing}\n"
                "터미널에서 아래 명령을 실행하세요:\n\n"
                "  han setup-gpu\n\n"
                "설치 항목: PyTorch (CUDA), diffusers, transformers, accelerate"
            )
            video_progress.done_sync(job_id, "failed")
        except Exception as e:
            job.status = "failed"
            job.error_msg = str(e)[:500]
            job.finished_at = datetime.utcnow()
            video_progress.done_sync(job_id, "failed")

        db.commit()
        _notify_chat(db, job)

    finally:
        _GPU_LOCK.release()  # 다음 GPU 작업 허용
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

    if provider == "local-gpu":
        t = threading.Thread(target=_run_local_gpu_generation, args=(job_id,), daemon=True)
        t.start()
        return True

    elif provider == "json2video":
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
        logger.warning("채팅 알림 실패: %s", e)

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
        logger.warning("DB 알림 생성 실패: %s", e)


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


@router.get("/ollama/models")
def ollama_list_models(current_user: User = Depends(get_current_user)):
    """Ollama에 설치된 모델 목록 조회."""
    try:
        import httpx
        from core.config import settings
        r = httpx.get("http://localhost:11434/api/tags", timeout=5.0)
        models = r.json().get("models", [])
        default_model = getattr(settings, "OLLAMA_MODEL", "")
        # 현재 로드된 모델 확인
        loaded = ""
        try:
            ps = httpx.get("http://localhost:11434/api/ps", timeout=3.0)
            ps_models = ps.json().get("models", [])
            if ps_models:
                loaded = ps_models[0].get("name", "")
        except Exception as e:
            logger.debug("Ollama ps 조회 실패: %s", e)
        return {
            "models": models,
            "default_model": default_model,
            "loaded_model": loaded,
            "ollama_running": True,
        }
    except Exception as e:
        return {"models": [], "default_model": "", "loaded_model": "", "ollama_running": False, "error": str(e)}


@router.delete("/ollama/models/{model_name:path}")
def ollama_delete_model(model_name: str, current_user: User = Depends(get_current_user)):
    """Ollama 모델 삭제."""
    try:
        import httpx
        r = httpx.request(
            "DELETE",
            "http://localhost:11434/api/delete",
            json={"name": model_name},
            timeout=30.0,
        )
        if r.status_code in (200, 204):
            return {"ok": True, "deleted": model_name}
        raise HTTPException(500, f"Ollama 삭제 실패: {r.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/ollama/models/pull")
def ollama_pull_model(body: dict, current_user: User = Depends(get_current_user)):
    """Ollama 모델 다운로드 요청.
    - GPU 작업(영상 생성)이 실행 중이면 큐에 추가하고 대기
    - 이미 같은 모델 pull 중이면 현재 상태 반환 (중복 방지)
    - WebSocket /ws/ollama-pull?model=<name> 으로 진행률 구독
    """
    model_name = body.get("name", "").strip()
    if not model_name:
        raise HTTPException(400, "모델 이름 필수")

    # 이미 pull 중이면 재시작 없이 현재 상태 반환
    existing = _PULL_PROGRESS.get(model_name, {})
    if existing.get("type") not in (None, "done", "error"):
        return {
            "ok": True,
            "pulling": model_name,
            "ws": "/api/video/ws/ollama-pull",
            "status": "already_running",
            "pct": existing.get("pct", 0),
        }

    # 이전 완료 상태 초기화 후 워커 스레드 시작
    _PULL_PROGRESS.pop(model_name, None)
    t = threading.Thread(target=_pull_worker, args=(model_name,), daemon=True)
    t.start()
    return {"ok": True, "pulling": model_name, "ws": "/api/video/ws/ollama-pull", "status": "started"}


@router.get("/ollama/pull-status")
def get_pull_status(current_user: User = Depends(get_current_user)):
    """현재 진행 중 / 완료된 모든 pull 상태 반환 (페이지 재진입 시 복원용)."""
    return {
        "pulls": _PULL_PROGRESS,
        "queue": _PULL_QUEUE_LIST[:],
    }


@router.delete("/ollama/models/pull/{model_name:path}")
def cancel_ollama_pull(model_name: str, current_user: User = Depends(get_current_user)):
    """진행 중인 Ollama pull 취소.
    - _PULL_CANCEL_FLAGS[model]을 True로 설정하면 워커 스레드가 다음 체크 시 중단
    - GPU 잠금 대기 중이거나 다운로드 중 모두 취소 가능
    """
    progress = _PULL_PROGRESS.get(model_name, {})
    ptype = progress.get("type")
    # 이미 완료/오류/취소 상태이면 404
    if ptype in ("done", "error", "cancelled") and model_name not in _PULL_QUEUE_LIST:
        raise HTTPException(404, "진행 중인 다운로드가 없습니다.")
    _PULL_CANCEL_FLAGS[model_name] = True
    return {"ok": True, "cancelled": model_name}


@router.websocket("/ws/ollama-pull")
async def ws_ollama_pull(websocket: WebSocket, model: str = Query(""), token: str = Query("")):
    """Ollama pull 진행률 WebSocket 구독.
    - pull은 POST /ollama/models/pull 로 시작, 이 WS는 진행률만 수신
    - 페이지 재진입 시 재연결하면 현재 상태를 즉시 수신 (진행률 복원)
    - 여러 클라이언트가 동시에 구독 가능
    """
    global _PULL_EVENT_LOOP
    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=4001)
        return
    if not model.strip():
        await websocket.close(code=4003)
        return

    # 이벤트 루프 캡처 (pull 워커 스레드에서 브로드캐스트 시 사용)
    _PULL_EVENT_LOOP = asyncio.get_running_loop()
    await websocket.accept()

    q: asyncio.Queue = asyncio.Queue()
    _PULL_SUBSCRIBERS.setdefault(model, []).append(q)

    try:
        # 재연결 시: 현재 상태 즉시 전송
        current = _PULL_PROGRESS.get(model)
        if current:
            await websocket.send_json(current)
            if current.get("type") in ("done", "error"):
                return  # 이미 완료 — 구독 불필요

        # 실시간 업데이트 수신 루프
        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=30.0)
                await websocket.send_json(data)
                if data.get("type") in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception as e:
                    logger.debug("Pull WS ping 실패: %s", e)
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("Pull WS 연결 오류: %s", e)
    finally:
        subs = _PULL_SUBSCRIBERS.get(model, [])
        if q in subs:
            subs.remove(q)


@router.post("/ollama/default")
def ollama_set_default(body: dict, current_user: User = Depends(get_current_user)):
    """기본 Ollama 모델 변경 (.env + 런타임 settings 즉시 반영)."""
    model_name = body.get("name", "").strip()
    if not model_name:
        raise HTTPException(400, "모델 이름 필수")
    import re
    from core.config import settings
    # .env 파일 업데이트
    env_path = os.path.join(os.path.dirname(__file__), "../../.env")
    env_path = os.path.normpath(env_path)
    try:
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                content = f.read()
            if re.search(r"^OLLAMA_MODEL=", content, re.MULTILINE):
                content = re.sub(r"^OLLAMA_MODEL=.*", f"OLLAMA_MODEL={model_name}", content, flags=re.MULTILINE)
            else:
                content += f"\nOLLAMA_MODEL={model_name}\n"
            with open(env_path, "w") as f:
                f.write(content)
        else:
            with open(env_path, "w") as f:
                f.write(f"OLLAMA_MODEL={model_name}\n")
    except Exception as e:
        raise HTTPException(500, f".env 업데이트 실패: {e}")
    # 런타임 즉시 반영
    settings.OLLAMA_MODEL = model_name
    # 새 모델 워밍업
    threading.Thread(target=_ollama_warmup, daemon=True).start()
    return {"ok": True, "default_model": model_name}


@router.post("/ollama/unload")
def ollama_unload_now(current_user: User = Depends(get_current_user)):
    """Ollama 현재 모델 즉시 VRAM 언로드."""
    _ollama_unload()
    return {"ok": True}


@router.get("/gpu-history")
def gpu_history(hours: int = 24, db: Session = Depends(get_db)):
    """최근 N시간 GPU 이력 반환."""
    from models.models import GpuHistory
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(GpuHistory)
        .filter(GpuHistory.recorded_at >= since)
        .order_by(GpuHistory.recorded_at.asc())
        .all()
    )
    return [
        {
            "t": r.recorded_at.isoformat(),
            "used": r.vram_used_mb,
            "total": r.vram_total_mb,
            "pct": round(r.vram_used_mb / max(r.vram_total_mb, 1) * 100, 1),
            "temp": r.temp_c,
            "util": r.util_pct,
        }
        for r in rows
    ]


@router.get("/ai-fallback-log")
def ai_fallback_log(limit: int = 20):
    """최근 AI Provider 폴백 이벤트 로그 (인메모리)."""
    from services.ai_provider import _FALLBACK_LOG
    return list(reversed(_FALLBACK_LOG[-limit:]))


@router.websocket("/ws/gpu-setup-log")
async def ws_gpu_setup_log(websocket: WebSocket, token: str = Query("")):
    """han setup-gpu 로그 파일 실시간 스트리밍 WebSocket.
    - 기존 로그를 먼저 전송, 이후 추가되는 줄을 0.5초 폴링으로 스트리밍
    - 메시지 형식: {type: "history"|"append"|"ping", content: string}
    """
    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=4001)
        return

    log_path = Path.home() / ".han" / "gpu-setup.log"
    await websocket.accept()

    try:
        # 기존 로그 전송
        if log_path.exists():
            content = log_path.read_text(errors="replace")
            if content:
                await websocket.send_json({"type": "history", "content": content})
        last_size = log_path.stat().st_size if log_path.exists() else 0

        # 새 줄 폴링
        while True:
            await asyncio.sleep(0.5)
            if log_path.exists():
                size = log_path.stat().st_size
                if size > last_size:
                    with open(log_path, "rb") as f:
                        f.seek(last_size)
                        new_bytes = f.read()
                    new_text = new_bytes.decode("utf-8", errors="replace")
                    last_size = size
                    await websocket.send_json({"type": "append", "content": new_text})
                else:
                    await websocket.send_json({"type": "ping"})
            else:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("로그 WS 연결 오류: %s", e)


def _record_gpu_history():
    """1분마다 GPU 상태를 DB에 기록 (startup 스케줄러에서 호출)."""
    try:
        import subprocess
        out = subprocess.check_output(
            ["nvidia-smi",
             "--query-gpu=memory.used,memory.total,temperature.gpu,utilization.gpu",
             "--format=csv,noheader,nounits"],
            timeout=5,
        ).decode().strip().splitlines()[0]
        parts = [p.strip() for p in out.split(",")]
        used, total, temp, util = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
    except Exception as e:
        logger.debug("nvidia-smi 조회 실패: %s", e)
        return

    try:
        from core.database import SessionLocal
        from models.models import GpuHistory
        db = SessionLocal()
        db.add(GpuHistory(vram_used_mb=used, vram_total_mb=total, temp_c=temp, util_pct=util))
        # 25시간 이전 데이터 정리 (1분 1행 × 60 × 25 = 1500행 유지)
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(hours=25)
        db.query(GpuHistory).filter(GpuHistory.recorded_at < cutoff).delete()
        db.commit()
        db.close()
    except Exception as e:
        logger.debug("GPU 기록 저장 실패: %s", e)


@router.get("/gpu-status")
def gpu_status():
    """GPU VRAM 현황 및 큐 상태 조회."""
    free_vram = _get_free_vram_gb()
    gpu_locked = _GPU_LOCK.locked()
    queue_len = len(_GPU_JOB_QUEUE)

    # nvidia-smi 상세 정보
    gpu_info = {}
    try:
        import subprocess
        lines = subprocess.check_output(
            ["nvidia-smi",
             "--query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu",
             "--format=csv,noheader,nounits"],
            timeout=5,
        ).decode().strip().splitlines()
        if lines:
            parts = [p.strip() for p in lines[0].split(",")]
            gpu_info = {
                "name": parts[0] if len(parts) > 0 else "",
                "total_mb": int(parts[1]) if len(parts) > 1 else 0,
                "used_mb": int(parts[2]) if len(parts) > 2 else 0,
                "free_mb": int(parts[3]) if len(parts) > 3 else 0,
                "temp_c": int(parts[4]) if len(parts) > 4 else 0,
                "util_pct": int(parts[5]) if len(parts) > 5 else 0,
            }
    except Exception as e:
        logger.debug("GPU 상태 조회 실패: %s", e)

    # VRAM 경고: 총 VRAM 대비 사용량 90% 초과 시
    vram_pct = 0
    vram_warning = False
    if gpu_info.get("total_mb", 0) > 0:
        vram_pct = round(gpu_info["used_mb"] / gpu_info["total_mb"] * 100, 1)
        vram_warning = vram_pct >= 90.0

    # Ollama 로드 상태 확인
    ollama_loaded_model = ""
    try:
        import httpx as _httpx
        r = _httpx.get("http://localhost:11434/api/ps", timeout=2.0)
        if r.status_code == 200:
            models_list = r.json().get("models", [])
            if models_list:
                ollama_loaded_model = models_list[0].get("name", "")
    except Exception as e:
        logger.debug("Ollama 로드 상태 확인 실패: %s", e)

    # 활성 pull 작업 수 (대기 중 + 실행 중)
    active_pulls = [
        m for m, p in _PULL_PROGRESS.items()
        if p.get("type") not in ("done", "error", "cancelled")
    ]
    pull_queue_length = len(_PULL_QUEUE_LIST)

    return {
        "gpu_locked": gpu_locked,
        "queue_length": queue_len,
        "queued_jobs": list(_GPU_JOB_QUEUE),
        "pull_queue_length": pull_queue_length,
        "active_pulls": active_pulls,
        "free_vram_gb": round(free_vram, 1),
        "vram_pct": vram_pct,
        "vram_warning": vram_warning,
        "ollama_loaded_model": ollama_loaded_model,
        **gpu_info,
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

    # API 키 사전 확인 (local-gpu는 API 키 불필요)
    if provider == "local-gpu":
        pass  # CUDA 가용 여부는 생성 시점에 확인
    elif provider == "json2video":
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


@router.post("/jobs/{job_id}/retry")
def retry_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """실패한 영상 잡 재시도 — 상태 초기화 후 백그라운드 재실행."""
    job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in ("failed", "pending"):
        raise HTTPException(400, f"재시도 불가 상태: {job.status} (실패 또는 대기 중 상태만 가능)")

    job.status = "pending"
    job.error_msg = ""
    job.finished_at = None
    db.commit()

    started = _start_video_job(job.id, db)
    if not started:
        # _start_video_job 내부에서 이미 failed 처리됨
        db.refresh(job)
    return _format_job(job)


@router.get("/models/status")
def get_model_status(
    model_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """HuggingFace 모델 inference 상태 확인 (warm / cold / loading / unavailable)."""
    # fal-ai / json2video 모델은 HF 상태 체크 불필요
    model_info = next((m for m in SUPPORTED_MODELS if m["id"] == model_id), None)
    if not model_info or model_info.get("provider") != "hf-inference":
        return {"model_id": model_id, "inference": None, "status": "n/a", "provider": model_info["provider"] if model_info else "unknown"}

    try:
        from huggingface_hub import HfApi
        api = HfApi()
        info = api.model_info(model_id, timeout=10)
        inference = getattr(info, "inference", None)
        # inference 값: "warm" | "cold" | "loading" | None
        if inference == "warm":
            status = "warm"
        elif inference in ("cold", "loading"):
            status = inference
        else:
            status = "unavailable"
        return {"model_id": model_id, "inference": inference, "status": status}
    except Exception as e:
        return {"model_id": model_id, "inference": None, "status": "error", "error": str(e)[:200]}


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


@router.post("/upload-image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    """배경 이미지 파일 업로드 → 서버 내 저장 후 접근 가능한 URL 반환."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"지원하지 않는 파일 형식입니다. (지원: JPEG, PNG, GIF, WebP)")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "파일 크기가 10MB를 초과합니다.")

    import uuid
    ext = Path(file.filename or "image.jpg").suffix.lower() or ".jpg"
    fname = f"{uuid.uuid4().hex}{ext}"
    dest = IMAGE_DIR / fname
    dest.write_bytes(data)

    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/api/video/images/{fname}"
    return {"url": url, "filename": fname}


@router.get("/images/{filename}")
def serve_image(
    filename: str,
    _: User = Depends(get_current_user),
):
    """업로드된 배경 이미지 서빙."""
    p = IMAGE_DIR / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "이미지를 찾을 수 없습니다")
    import mimetypes
    mt, _ = mimetypes.guess_type(str(p))
    return FileResponse(str(p), media_type=mt or "image/jpeg")
