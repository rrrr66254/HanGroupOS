"""
영상 생성 라우터 — HuggingFace Inference API (무료 티어)
지원 모델: LTX-Video, CogVideoX, Text-to-Video-MS
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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
]


def _get_hf_token(db: Session) -> Optional[str]:
    """ExternalApiKey에서 HuggingFace 토큰 조회."""
    row = (
        db.query(ExternalApiKey)
        .filter(ExternalApiKey.service == "huggingface", ExternalApiKey.is_active == True)
        .first()
    )
    return row.api_key if row else None


class VideoGenerateRequest(BaseModel):
    prompt: str
    model_id: str = "Lightricks/LTX-Video-0.9.8-13B-distilled"
    company_id: Optional[int] = None
    num_frames: Optional[int] = None       # 프레임 수 (모델마다 다름)
    fps: Optional[int] = None             # FPS


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
        video_url = f"/api/video/file/{job.id}"
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


def _notify_chat(db, job):
    """VideoJob 완료/실패 후 연관된 채팅 세션에 알림 메시지를 추가한다."""
    try:
        from models.models import ChatMessage
        session_id = (job.meta or {}).get("session_id")
        if not session_id:
            return
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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/models")
def list_models():
    """지원 영상 생성 모델 목록."""
    return SUPPORTED_MODELS


@router.post("/generate")
def generate_video(
    req: VideoGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """영상 생성 요청 — 백그라운드에서 HuggingFace 호출."""
    token = _get_hf_token(db)
    if not token:
        raise HTTPException(
            400,
            detail="HuggingFace API 토큰이 설정되지 않았습니다. "
                   "관리자 → API 키 관리에서 'huggingface' 서비스로 등록하세요.",
        )

    model_info = next((m for m in SUPPORTED_MODELS if m["id"] == req.model_id), None)
    if not model_info:
        raise HTTPException(400, f"지원하지 않는 모델: {req.model_id}")

    meta = {}
    if req.num_frames:
        meta["num_frames"] = req.num_frames

    job = VideoJob(
        company_id=req.company_id,
        prompt=req.prompt,
        model_id=req.model_id,
        provider=model_info["provider"],
        status="pending",
        meta=meta,
        created_by=current_user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_generation, job.id, token)
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
