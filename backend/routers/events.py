"""Real-time event stream (SSE) for the group home dashboard."""
import asyncio
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from core.database import get_db, SessionLocal
from core.security import get_current_user
from models.models import WorkLog, SiteSubmission, Company, CompanySite, AgentMessage

router = APIRouter(prefix="/api/events", tags=["events"])


def _collect_since(db: Session, since: datetime):
    """Collect recent events from multiple tables."""
    events = []

    # New work cycles completed
    logs = (
        db.query(WorkLog)
        .filter(WorkLog.created_at > since, WorkLog.level == "ceo")
        .order_by(WorkLog.created_at.asc())
        .limit(10)
        .all()
    )
    for log in logs:
        company = db.query(Company).filter(Company.id == log.company_id).first()
        events.append({
            "type": "work_done",
            "icon": "⚙️",
            "title": f"{company.name if company else '?'} — 업무 사이클 완료",
            "body": (log.result or "")[:80],
            "company_id": log.company_id,
            "created_at": log.created_at.isoformat(),
        })

    # New site submissions (form data collected)
    subs = (
        db.query(SiteSubmission)
        .filter(SiteSubmission.created_at > since)
        .order_by(SiteSubmission.created_at.asc())
        .limit(10)
        .all()
    )
    for sub in subs:
        site = db.query(CompanySite).filter(CompanySite.id == sub.site_id).first()
        company = db.query(Company).filter(Company.id == sub.company_id).first() if sub.company_id else None
        submitter = sub.form_data.get("name") or sub.form_data.get("email") or "익명"
        events.append({
            "type": "form_submitted",
            "icon": "📬",
            "title": f"{company.name if company else '?'} — 새 문의 수신",
            "body": f"'{submitter}'으로부터 {sub.source} 폼 제출",
            "company_id": sub.company_id,
            "created_at": sub.created_at.isoformat(),
        })

    # New P2P agent messages
    msgs = (
        db.query(AgentMessage)
        .filter(AgentMessage.created_at > since)
        .order_by(AgentMessage.created_at.asc())
        .limit(10)
        .all()
    )
    for msg in msgs:
        company = db.query(Company).filter(Company.id == msg.company_id).first()
        events.append({
            "type": "agent_p2p",
            "icon": "💬",
            "title": f"{msg.from_name} → {msg.to_name}",
            "body": (msg.topic or "")[:60],
            "company_id": msg.company_id,
            "created_at": msg.created_at.isoformat(),
        })

    # Sites just deployed
    sites = (
        db.query(CompanySite)
        .filter(CompanySite.deployed_at != None, CompanySite.deployed_at > since)
        .order_by(CompanySite.deployed_at.asc())
        .limit(5)
        .all()
    )
    for site in sites:
        company = db.query(Company).filter(Company.id == site.company_id).first()
        events.append({
            "type": "site_deployed",
            "icon": "🌐",
            "title": f"{company.name if company else '?'} — 웹사이트 배포",
            "body": f"/sites/{site.slug}",
            "company_id": site.company_id,
            "created_at": site.deployed_at.isoformat(),
        })

    # Sort by time
    events.sort(key=lambda e: e["created_at"])
    return events


@router.get("/stream")
async def event_stream(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """SSE endpoint streaming real-time group events."""
    async def generate():
        since = datetime.utcnow() - timedelta(minutes=10)
        # Yield recent history first
        with SessionLocal() as new_db:
            history = _collect_since(new_db, since)
        for ev in history:
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'ready'})}\n\n"

        # Then poll for new events
        since = datetime.utcnow()
        while True:
            await asyncio.sleep(5)
            try:
                with SessionLocal() as new_db:
                    new_events = _collect_since(new_db, since)
                since = datetime.utcnow()
                for ev in new_events:
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                # Heartbeat
                yield f"data: {json.dumps({'type': 'ping', 'ts': datetime.utcnow().isoformat()})}\n\n"
            except Exception:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recent")
def recent_events(
    minutes: int = 60,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(minutes=minutes)
    return _collect_since(db, since)
