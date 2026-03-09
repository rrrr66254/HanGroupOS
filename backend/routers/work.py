"""
Work router: autonomous work loop, SSE streaming, P2P messages, weekly report.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.database import get_db, SessionLocal
from core.auth import get_current_user
from models.models import WorkLog, AgentMessage, User, Company, OrgNode
from services.work_service import (
    run_work_cycle, run_work_cycle_stream,
    run_agent_p2p, generate_weekly_report,
)

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


@router.get("/stream/{company_id}")
def stream_work_cycle(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint: streams each agent result as it's generated."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Run in a new DB session so SSE generator owns its lifecycle
    def generate():
        with SessionLocal() as new_db:
            try:
                for event in run_work_cycle_stream(new_db, company_id):
                    yield event
            except Exception as e:
                import json
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/p2p")
def agent_p2p_message(
    req: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Have one agent send a message to another and receive a reply."""
    from_node_id = req.get("from_node_id")
    to_node_id = req.get("to_node_id")
    topic = req.get("topic", "업무 협의")

    if not from_node_id or not to_node_id:
        raise HTTPException(400, "from_node_id and to_node_id required")

    from_node = db.query(OrgNode).filter(OrgNode.id == from_node_id).first()
    to_node = db.query(OrgNode).filter(OrgNode.id == to_node_id).first()
    if not from_node or not to_node:
        raise HTTPException(404, "Agent node not found")

    msg = run_agent_p2p(db, from_node, to_node, topic)
    return {
        "id": msg.id,
        "from_name": msg.from_name,
        "to_name": msg.to_name,
        "topic": msg.topic,
        "message": msg.message,
        "reply": msg.reply,
        "created_at": msg.created_at.isoformat(),
    }


@router.get("/p2p")
def get_p2p_messages(
    company_id: Optional[int] = Query(None),
    limit: int = Query(30, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get agent P2P message history."""
    query = db.query(AgentMessage)
    if company_id:
        query = query.filter(AgentMessage.company_id == company_id)
    msgs = query.order_by(AgentMessage.created_at.desc()).limit(limit).all()
    return [
        {
            "id": m.id,
            "from_name": m.from_name,
            "to_name": m.to_name,
            "topic": m.topic,
            "message": m.message,
            "reply": m.reply,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


@router.post("/weekly-report/{company_id}")
def weekly_report(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate AI weekly management report for a company."""
    result = generate_weekly_report(db, company_id)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result
