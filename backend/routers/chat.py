import re
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import ChatSession, ChatMessage, User, AISuggestion, Company
from schemas.schemas import (
    ChatSessionCreate, ChatSessionOut,
    ChatMessageOut, ChatRequest,
)
from services.ai_provider import (
    get_provider_from_db,
    CHAIRMAN_SYSTEM, CEO_SYSTEM,
)
from services.org_service import create_company_org


def _execute_actions(ai_response: str, db: Session, user_id: int) -> tuple:
    """Parse <<CREATE_COMPANY:...>> blocks, execute them, return (clean_text, result_lines)."""
    results = []
    pattern = re.compile(r'<<CREATE_COMPANY:(.*?)>>', re.DOTALL)

    for match in pattern.finditer(ai_response):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
            company = Company(
                name=data.get("name", "신규 계열사"),
                description=data.get("description", ""),
                industry=data.get("industry", "일반"),
                vision=data.get("vision", ""),
                status="active",
                created_by=user_id,
            )
            db.add(company)
            db.flush()
            create_company_org(db, company.id, data.get("industry", "general"), "any")
            db.flush()
            results.append(f"\n\n✅ **계열사 설립 완료** — {company.name} (ID #{company.id})\n산업: {company.industry} | 조직 구조 자동 구성됨")
        except Exception as exc:
            results.append(f"\n\n❌ 계열사 설립 오류: {exc}")

    clean = pattern.sub("", ai_response).strip()
    return clean, results

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _get_system(session_type: str) -> str:
    if session_type == "chairman":
        return CHAIRMAN_SYSTEM
    elif session_type == "ceo":
        return CEO_SYSTEM
    return "당신은 한그룹의 AI 어시스턴트입니다."


@router.get("/sessions", response_model=List[ChatSessionOut])
def list_sessions(
    session_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ChatSession).filter(ChatSession.created_by == current_user.id)
    if session_type:
        q = q.filter(ChatSession.session_type == session_type)
    return q.order_by(ChatSession.created_at.desc()).all()


@router.post("/sessions", response_model=ChatSessionOut)
def create_session(
    session_in: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ChatSession(
        company_id=session_in.company_id,
        session_type=session_in.session_type,
        title=session_in.title,
        agent_name=session_in.agent_name,
        created_by=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageOut])
def get_messages(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )


@router.post("/send", response_model=ChatMessageOut)
def send_message(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    user_msg = ChatMessage(
        session_id=req.session_id,
        role="user",
        content=req.content,
        sender_name=current_user.username,
    )
    db.add(user_msg)
    db.flush()

    # Build message history
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == req.session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    messages = [{"role": m.role, "content": m.content} for m in history]

    # Call AI
    provider = get_provider_from_db(db, current_user.id, req.provider_override)
    if req.model_override:
        provider.model = req.model_override

    system_prompt = _get_system(session.session_type)
    ai_response = provider.chat(
        messages, system=system_prompt, session_type=session.session_type
    )

    # Execute any embedded action blocks (e.g. <<CREATE_COMPANY:...>>)
    clean_response, action_results = _execute_actions(ai_response, db, current_user.id)
    final_content = clean_response + "".join(action_results)

    # Save AI response
    ai_name = session.agent_name or {
        "chairman": "AI 회장",
        "ceo": "AI CEO",
        "committee": "AI 위원회",
    }.get(session.session_type, "AI 어시스턴트")

    ai_msg = ChatMessage(
        session_id=req.session_id,
        role="assistant",
        content=final_content,
        sender_name=ai_name,
    )
    db.add(ai_msg)

    # Auto-generate suggestion if content triggers keywords
    trigger_words = ["새로운", "신규", "만들", "추가", "설립", "시작"]
    if any(w in req.content for w in trigger_words):
        suggestion = AISuggestion(
            company_id=session.company_id,
            title="AI 제안: 새로운 기회 탐지",
            description=f"대화 분석 결과: {req.content[:100]}... 관련 기회가 감지되었습니다.",
            suggestion_type="opportunity",
            priority="medium",
        )
        db.add(suggestion)

    db.commit()
    db.refresh(ai_msg)
    return ai_msg


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.created_by == current_user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/suggestions")
def get_suggestions(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AISuggestion).filter(AISuggestion.status == "open")
    if company_id:
        q = q.filter(AISuggestion.company_id == company_id)
    return q.order_by(AISuggestion.created_at.desc()).limit(20).all()


@router.post("/suggestions/{suggestion_id}/dismiss")
def dismiss_suggestion(
    suggestion_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = db.query(AISuggestion).filter(AISuggestion.id == suggestion_id).first()
    if s:
        s.status = "dismissed"
        db.commit()
    return {"ok": True}
