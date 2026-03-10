"""감사 로그 — 승인/반려/터미널 이력 통합 조회."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from core.database import get_db
from core.security import get_current_user
from models.models import ApprovalRequest, TerminalRequest, User

router = APIRouter(prefix="/api/audit", tags=["audit"])


def _username(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    return u.username if u else f"user#{user_id}"


@router.get("/log")
def audit_log(
    kind: Optional[str] = Query(None, description="approval | terminal | all"),
    status: Optional[str] = Query(None),
    limit: int = Query(60, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """ApprovalRequest + TerminalRequest를 시간순 통합 감사 로그로 반환."""
    entries = []

    # ── ApprovalRequests ──────────────────────────────────────────────────────
    if kind in (None, "all", "approval"):
        q = db.query(ApprovalRequest)
        if status:
            q = q.filter(ApprovalRequest.status == status)
        for a in q.order_by(ApprovalRequest.created_at.desc()).all():
            event_at = (a.reviewed_at or a.created_at).isoformat()
            entries.append({
                "id": a.id,
                "kind": "approval",
                "title": a.title,
                "description": (a.description or "")[:200],
                "category": a.request_type,
                "status": a.status,
                "actor": a.requester,
                "reviewer": _username(db, a.reviewed_by),
                "reviewer_note": a.reviewer_note or "",
                "created_at": a.created_at.isoformat(),
                "event_at": event_at,
                "command": None,
                "exit_code": None,
                "output": None,
            })

    # ── TerminalRequests ──────────────────────────────────────────────────────
    if kind in (None, "all", "terminal"):
        q = db.query(TerminalRequest)
        if status:
            q = q.filter(TerminalRequest.status == status)
        for t in q.order_by(TerminalRequest.created_at.desc()).all():
            event_at = (t.executed_at or t.decided_at or t.created_at).isoformat()
            entries.append({
                "id": t.id,
                "kind": "terminal",
                "title": t.command[:80],
                "description": t.reason or "",
                "category": "terminal",
                "status": t.status,
                "actor": t.requested_by_name,
                "reviewer": _username(db, t.approved_by),
                "reviewer_note": "",
                "created_at": t.created_at.isoformat(),
                "event_at": event_at,
                "command": t.command,
                "exit_code": t.exit_code,
                "output": (t.output or "")[:500] if t.output else None,
            })

    # Sort by event_at desc, then slice
    entries.sort(key=lambda e: e["event_at"], reverse=True)
    return {
        "total": len(entries),
        "entries": entries[offset: offset + limit],
    }


@router.get("/stats")
def audit_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """빠른 통계: 총 건수, 상태별 분포."""
    approval_total = db.query(ApprovalRequest).count()
    approval_pending = db.query(ApprovalRequest).filter(ApprovalRequest.status == "pending").count()
    approval_approved = db.query(ApprovalRequest).filter(ApprovalRequest.status == "approved").count()
    approval_rejected = db.query(ApprovalRequest).filter(ApprovalRequest.status == "rejected").count()

    terminal_total = db.query(TerminalRequest).count()
    terminal_pending = db.query(TerminalRequest).filter(TerminalRequest.status == "pending").count()
    terminal_executed = db.query(TerminalRequest).filter(TerminalRequest.status == "executed").count()
    terminal_rejected = db.query(TerminalRequest).filter(TerminalRequest.status == "rejected").count()

    return {
        "approval": {
            "total": approval_total,
            "pending": approval_pending,
            "approved": approval_approved,
            "rejected": approval_rejected,
        },
        "terminal": {
            "total": terminal_total,
            "pending": terminal_pending,
            "executed": terminal_executed,
            "rejected": terminal_rejected,
        },
    }
