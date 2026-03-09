"""
Work router: autonomous work loop endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.auth import get_current_user
from models.models import WorkLog, User, Company
from services.work_service import run_work_cycle

router = APIRouter(prefix="/api/work", tags=["work"])


@router.post("/trigger/{company_id}")
def trigger_work_cycle(
    company_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger an autonomous work cycle for a company (runs synchronously for now)."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    result = run_work_cycle(db, company_id)
    return result


@router.get("/logs")
def get_work_logs(
    company_id: Optional[int] = Query(None),
    cycle_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get work logs, optionally filtered by company or cycle."""
    query = db.query(WorkLog)
    if company_id:
        query = query.filter(WorkLog.company_id == company_id)
    if cycle_id:
        query = query.filter(WorkLog.cycle_id == cycle_id)

    logs = query.order_by(WorkLog.created_at.desc()).limit(limit).all()

    return [
        {
            "id": l.id,
            "company_id": l.company_id,
            "org_node_id": l.org_node_id,
            "agent_name": l.agent_name,
            "agent_role": l.agent_role,
            "level": l.level,
            "task": l.task,
            "result": l.result,
            "cycle_id": l.cycle_id,
            "parent_log_id": l.parent_log_id,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]


@router.get("/cycles")
def get_cycles(
    company_id: Optional[int] = Query(None),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get distinct work cycles with CEO summary."""
    query = db.query(WorkLog)
    if company_id:
        query = query.filter(WorkLog.company_id == company_id)

    # Get CEO-level logs (one per cycle = the summary)
    ceo_logs = (
        query.filter(WorkLog.level == "ceo")
        .order_by(WorkLog.created_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for l in ceo_logs:
        count = db.query(WorkLog).filter(WorkLog.cycle_id == l.cycle_id).count()
        result.append({
            "cycle_id": l.cycle_id,
            "company_id": l.company_id,
            "ceo_name": l.agent_name,
            "summary": l.result,
            "total_agents": count,
            "created_at": l.created_at.isoformat(),
        })

    return result
