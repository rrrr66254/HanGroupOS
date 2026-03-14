"""AI 에이전트 학습 피드백 루프 — 좋아요/싫어요 + 품질 반영."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from core.database import get_db
from models.models import AiFeedback, ChatMessage, AiAgentMetrics

router = APIRouter(prefix="/api/ai-feedback", tags=["ai-feedback"])


class FeedbackCreate(BaseModel):
    message_id: int
    session_id: Optional[int] = None
    rating: int  # 1 or -1
    comment: str = ""
    agent_name: str = ""


class FeedbackStats(BaseModel):
    agent_name: str


@router.post("")
def submit_feedback(req: FeedbackCreate, user_id: int = 1, db: Session = Depends(get_db)):
    """AI 응답에 피드백 제출."""
    if req.rating not in (1, -1):
        raise HTTPException(400, "rating must be 1 or -1")

    msg = db.query(ChatMessage).get(req.message_id)
    if not msg:
        raise HTTPException(404, "메시지를 찾을 수 없습니다.")

    # 중복 체크
    existing = db.query(AiFeedback).filter(
        AiFeedback.message_id == req.message_id,
        AiFeedback.user_id == user_id,
    ).first()
    if existing:
        existing.rating = req.rating
        existing.comment = req.comment
    else:
        db.add(AiFeedback(
            message_id=req.message_id,
            session_id=req.session_id,
            user_id=user_id,
            rating=req.rating,
            comment=req.comment,
            agent_name=req.agent_name or msg.sender_name or "",
        ))
    db.commit()

    # 웹훅 알림 (싫어요일 때)
    if req.rating == -1:
        try:
            from routers.webhook_notify import send_webhook_alert
            send_webhook_alert(
                "AI 응답 부정 피드백",
                f"에이전트: {req.agent_name}, 메시지#{req.message_id}\n사유: {req.comment or '없음'}",
                "quality_alert",
            )
        except Exception:
            pass

    return {"status": "ok"}


@router.get("/stats")
def feedback_stats(agent_name: str = "", db: Session = Depends(get_db)):
    """에이전트별 피드백 통계."""
    q = db.query(AiFeedback)
    if agent_name:
        q = q.filter(AiFeedback.agent_name == agent_name)
    feedbacks = q.all()

    if not feedbacks:
        return {"total": 0, "positive": 0, "negative": 0, "satisfaction_rate": 0, "by_agent": []}

    positive = sum(1 for f in feedbacks if f.rating > 0)
    negative = sum(1 for f in feedbacks if f.rating < 0)
    total = len(feedbacks)
    rate = round(positive / total * 100, 1) if total > 0 else 0

    # 에이전트별 집계
    agent_stats: dict = {}
    for f in feedbacks:
        name = f.agent_name or "unknown"
        if name not in agent_stats:
            agent_stats[name] = {"agent_name": name, "positive": 0, "negative": 0, "total": 0}
        agent_stats[name]["total"] += 1
        if f.rating > 0:
            agent_stats[name]["positive"] += 1
        else:
            agent_stats[name]["negative"] += 1

    by_agent = []
    for a in agent_stats.values():
        a["satisfaction_rate"] = round(a["positive"] / a["total"] * 100, 1) if a["total"] > 0 else 0
        by_agent.append(a)
    by_agent.sort(key=lambda x: x["satisfaction_rate"], reverse=True)

    return {
        "total": total,
        "positive": positive,
        "negative": negative,
        "satisfaction_rate": rate,
        "by_agent": by_agent,
    }


@router.get("/message/{message_id}")
def get_message_feedback(message_id: int, user_id: int = 1, db: Session = Depends(get_db)):
    """특정 메시지의 피드백 조회."""
    fb = db.query(AiFeedback).filter(
        AiFeedback.message_id == message_id,
        AiFeedback.user_id == user_id,
    ).first()
    if not fb:
        return {"rating": None}
    return {"rating": fb.rating, "comment": fb.comment}


@router.get("/recent")
def recent_feedback(limit: int = 20, db: Session = Depends(get_db)):
    """최근 피드백 이력."""
    feedbacks = db.query(AiFeedback).order_by(
        AiFeedback.created_at.desc()
    ).limit(limit).all()
    return [
        {
            "id": f.id,
            "message_id": f.message_id,
            "agent_name": f.agent_name,
            "rating": f.rating,
            "comment": f.comment,
            "created_at": f.created_at.isoformat(),
        }
        for f in feedbacks
    ]
