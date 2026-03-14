"""AI 대화 요약 API."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db

router = APIRouter(prefix="/api/chat-summary", tags=["chat-summary"])


@router.post("/auto")
def auto_summarize(
    days: int = Query(7, ge=1, le=30),
    min_messages: int = Query(10, ge=3, le=100),
    db: Session = Depends(get_db),
):
    """장기 채팅 세션 자동 요약 실행."""
    from services.chat_summarizer import summarize_long_sessions
    count = summarize_long_sessions(db, days=days, min_messages=min_messages)
    return {"status": "ok", "summarized": count}


@router.get("/session/{session_id}")
def summarize_session(session_id: int, db: Session = Depends(get_db)):
    """단일 세션 즉시 요약."""
    from services.chat_summarizer import summarize_single_session
    summary = summarize_single_session(session_id, db)
    return {"session_id": session_id, "summary": summary}
