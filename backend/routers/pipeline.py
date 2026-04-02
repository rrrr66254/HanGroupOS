"""
자율 파이프라인 API
==================
POST /api/pipeline/run      — 파이프라인 즉시 실행 (BackgroundTask)
GET  /api/pipeline/runs     — 실행 이력 목록
GET  /api/pipeline/runs/{id} — 특정 실행 상세 (단계별 로그 포함)
GET  /api/pipeline/runs/{id}/stages — 단계별 로그만 조회
"""
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import PipelineRun, PipelineStageLog, User

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


def _serialize_run(run: PipelineRun) -> dict:
    return {
        "id": run.id,
        "status": run.status,
        "trigger": run.trigger,
        "current_stage": run.current_stage,
        "total_stages": run.total_stages,
        "summary": run.summary,
        "action_items": run.action_items or [],
        "meta": run.meta or {},
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }


def _serialize_stage(s: PipelineStageLog) -> dict:
    return {
        "id": s.id,
        "stage_index": s.stage_index,
        "stage_name": s.stage_name,
        "status": s.status,
        "input_summary": s.input_summary,
        "output": s.output,
        "stats": s.stats or {},
        "error": s.error,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "finished_at": s.finished_at.isoformat() if s.finished_at else None,
    }


@router.post("/run", summary="자율 파이프라인 실행")
def trigger_pipeline(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """6단계 자율 파이프라인을 백그라운드로 즉시 실행합니다."""
    from services.pipeline_engine import run_pipeline

    # 이미 실행 중인 파이프라인이 있으면 반환
    running = db.query(PipelineRun).filter(PipelineRun.status == "running").first()
    if running:
        return {
            "message": "이미 실행 중인 파이프라인이 있습니다.",
            "run_id": running.id,
            "already_running": True,
        }

    # 플레이스홀더 run 생성 (백그라운드에서 실제 실행)
    run = PipelineRun(
        status="running",
        trigger="manual",
        triggered_by=current_user.id,
        current_stage=0,
        total_stages=6,
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    run_id = run.id

    def _bg(user_id: int, rid: int):
        from core.database import SessionLocal
        from services.pipeline_engine import run_pipeline as _run
        bg_db = SessionLocal()
        try:
            # 플레이스홀더 삭제 후 실제 실행
            bg_db.query(PipelineRun).filter(PipelineRun.id == rid).delete()
            bg_db.commit()
            _run(bg_db, user_id, trigger="manual")
        finally:
            bg_db.close()

    background_tasks.add_task(_bg, current_user.id, run_id)

    return {
        "message": "파이프라인이 백그라운드에서 시작되었습니다.",
        "run_id": run_id,
        "already_running": False,
    }


@router.get("/runs", summary="파이프라인 실행 이력")
def list_runs(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = (
        db.query(PipelineRun)
        .order_by(PipelineRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_run(r) for r in runs]


@router.get("/runs/latest", summary="최신 파이프라인 실행")
def get_latest_run(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(PipelineRun).order_by(PipelineRun.started_at.desc()).first()
    if not run:
        return None
    stages = (
        db.query(PipelineStageLog)
        .filter(PipelineStageLog.run_id == run.id)
        .order_by(PipelineStageLog.stage_index)
        .all()
    )
    result = _serialize_run(run)
    result["stages"] = [_serialize_stage(s) for s in stages]
    return result


@router.get("/runs/{run_id}", summary="파이프라인 실행 상세")
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(PipelineRun).filter(PipelineRun.id == run_id).first()
    if not run:
        from fastapi import HTTPException
        raise HTTPException(404, "파이프라인 실행을 찾을 수 없습니다.")
    stages = (
        db.query(PipelineStageLog)
        .filter(PipelineStageLog.run_id == run_id)
        .order_by(PipelineStageLog.stage_index)
        .all()
    )
    result = _serialize_run(run)
    result["stages"] = [_serialize_stage(s) for s in stages]
    return result
