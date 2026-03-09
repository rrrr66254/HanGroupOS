import re
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db, SessionLocal
from core.security import get_current_user
from models.models import ChatSession, ChatMessage, User, AISuggestion, Company, OrgNode
from schemas.schemas import (
    ChatSessionCreate, ChatSessionOut,
    ChatMessageOut, ChatRequest, CompanyQueryRequest,
    ConfirmCompanyRequest, BriefCeoRequest,
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


@router.post("/stream")
def stream_message(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream AI response via Server-Sent Events (Ollama only; others fall back to single chunk)."""
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

    # Build history
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == req.session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    messages_list = [{"role": m.role, "content": m.content} for m in history]

    provider = get_provider_from_db(db, current_user.id, req.provider_override)
    if req.model_override:
        provider.model = req.model_override

    system_prompt = _get_system(session.session_type)
    ai_name = session.agent_name or {
        "chairman": "AI 회장",
        "ceo": "AI CEO",
        "committee": "AI 위원회",
    }.get(session.session_type, "AI 어시스턴트")

    # Capture values needed inside generator (DB session will be closed by then)
    session_id = req.session_id
    user_id = current_user.id
    prov = provider
    sys_prompt = system_prompt
    msgs = messages_list
    name = ai_name
    db.commit()

    def generate():
        import httpx
        full_content = ""

        try:
            if prov.provider == "ollama":
                base_url = prov.base_url or __import__("core.config", fromlist=["settings"]).settings.OLLAMA_BASE_URL
                full_msgs = []
                if sys_prompt:
                    full_msgs.append({"role": "system", "content": sys_prompt})
                full_msgs.extend(msgs)

                with httpx.stream(
                    "POST",
                    f"{base_url}/api/chat",
                    json={"model": prov.model, "messages": full_msgs, "stream": True},
                    timeout=120,
                ) as r:
                    for line in r.iter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            chunk = data.get("message", {}).get("content", "")
                            done = data.get("done", False)
                            if chunk:
                                full_content += chunk
                                yield f"data: {json.dumps({'chunk': chunk, 'done': False}, ensure_ascii=False)}\n\n"
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
            else:
                # Non-streaming providers: call normally and emit as single chunk
                response = prov.chat(msgs, system=sys_prompt, session_type="chairman")
                full_content = response
                yield f"data: {json.dumps({'chunk': response, 'done': False}, ensure_ascii=False)}\n\n"

        except Exception as e:
            full_content = f"⚠️ 스트리밍 오류: {e}\n\nOllama가 실행 중인지 확인해주세요: `ollama serve`"
            yield f"data: {json.dumps({'chunk': full_content, 'done': False}, ensure_ascii=False)}\n\n"

        # Check for CREATE_COMPANY — emit preview event instead of executing
        preview_match = re.search(r'<<CREATE_COMPANY:(.*?)>>', full_content, re.DOTALL)
        if preview_match:
            raw = preview_match.group(1).strip()
            try:
                preview_data = json.loads(raw)
                clean_text = re.sub(r'<<CREATE_COMPANY:.*?>>', '', full_content, flags=re.DOTALL).strip()
                with SessionLocal() as new_db:
                    ai_msg = ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=clean_text,
                        sender_name=name,
                    )
                    new_db.add(ai_msg)
                    new_db.commit()
                    new_db.refresh(ai_msg)
                yield f"data: {json.dumps({'type': 'preview', 'company_data': preview_data, 'chunk': '', 'done': True, 'message_id': ai_msg.id, 'final_content': clean_text}, ensure_ascii=False)}\n\n"
                return
            except (json.JSONDecodeError, Exception):
                pass  # fall through to normal execution

        # Save complete AI message (new DB session since original is closed)
        with SessionLocal() as new_db:
            clean, action_results = _execute_actions(full_content, new_db, user_id)
            final = clean + "".join(action_results)
            ai_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=final,
                sender_name=name,
            )
            new_db.add(ai_msg)
            new_db.commit()
            new_db.refresh(ai_msg)
            yield f"data: {json.dumps({'chunk': '', 'done': True, 'message_id': ai_msg.id, 'final_content': final}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/company-query")
def company_query(
    req: CompanyQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Query a company through its CEO — returns delegation steps + AI answer."""
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    # Find CEO node for this company
    ceo_node = (
        db.query(OrgNode)
        .filter(OrgNode.company_id == req.company_id, OrgNode.level == "ceo")
        .first()
    )
    ceo_name = ceo_node.name if ceo_node else f"{company.name} CEO"

    # Build company context and call CEO AI
    context = (
        f"회사: {company.name}\n"
        f"산업: {company.industry}\n"
        f"설명: {company.description}\n"
        f"비전: {company.vision}\n\n"
        f"회장 질문: {req.question}"
    )

    provider = get_provider_from_db(db, current_user.id)
    answer = provider.chat(
        [{"role": "user", "content": context}],
        system=CEO_SYSTEM,
        session_type="ceo",
    )

    delegation = [
        {"from": "회장", "to": ceo_name, "message": f"질문 전달: {req.question[:40]}…", "status": "done"},
        {"from": ceo_name, "to": "운영팀", "message": "데이터 수집 및 현황 파악", "status": "done"},
        {"from": "운영팀", "to": ceo_name, "message": "보고 완료", "status": "done"},
        {"from": ceo_name, "to": "회장", "message": "최종 보고 전달", "status": "done"},
    ]

    return {
        "company": {"id": company.id, "name": company.name, "industry": company.industry},
        "ceo_name": ceo_name,
        "delegation": delegation,
        "answer": answer,
    }


@router.post("/confirm-company")
def confirm_company(
    req: ConfirmCompanyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actually create a company that was previewed but not yet confirmed."""
    company = Company(
        name=req.name,
        description=req.description,
        industry=req.industry,
        vision=req.vision,
        status="active",
        created_by=current_user.id,
    )
    db.add(company)
    db.flush()
    create_company_org(db, company.id, req.industry, "any")
    db.commit()
    db.refresh(company)
    return {"id": company.id, "name": company.name, "industry": company.industry}


@router.post("/brief-ceo")
def brief_ceo(
    req: BriefCeoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send an initial strategy briefing from chairman to newly founded company's CEO."""
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    ceo_node = (
        db.query(OrgNode)
        .filter(OrgNode.company_id == req.company_id, OrgNode.level == "ceo")
        .first()
    )
    ceo_name = ceo_node.name if ceo_node else f"{company.name} CEO"

    briefing = (
        f"안녕하세요 {ceo_name}님. 한그룹 회장입니다.\n\n"
        f"'{company.name}' 설립을 진심으로 축하합니다.\n\n"
        f"회사 개요:\n"
        f"- 산업: {company.industry}\n"
        f"- 비전: {company.vision or '미정'}\n"
        f"- 설명: {company.description or '미정'}\n\n"
        f"초기 전략 방향을 수립하고 첫 100일 실행 계획을 간략히 보고해 주세요."
    )

    provider = get_provider_from_db(db, current_user.id)
    answer = provider.chat(
        [{"role": "user", "content": briefing}],
        system=CEO_SYSTEM,
        session_type="ceo",
    )

    # Find or create CEO session for this company
    ceo_session = (
        db.query(ChatSession)
        .filter(ChatSession.company_id == req.company_id, ChatSession.session_type == "ceo")
        .first()
    )
    if not ceo_session:
        ceo_session = ChatSession(
            company_id=req.company_id,
            session_type="ceo",
            title=f"{company.name} CEO 브리핑",
            agent_name=ceo_name,
            created_by=current_user.id,
        )
        db.add(ceo_session)
        db.flush()

    db.add(ChatMessage(session_id=ceo_session.id, role="user", content=briefing, sender_name="회장"))
    db.add(ChatMessage(session_id=ceo_session.id, role="assistant", content=answer, sender_name=ceo_name))
    db.commit()

    return {
        "company": {"id": company.id, "name": company.name},
        "ceo_name": ceo_name,
        "ceo_session_id": ceo_session.id,
        "answer": answer,
        "delegation": [
            {"from": "회장", "to": ceo_name, "message": "설립 축하 및 초기 전략 브리핑 전달", "status": "done"},
            {"from": ceo_name, "to": "경영팀", "message": "전략 방향 수립 착수", "status": "done"},
            {"from": ceo_name, "to": "회장", "message": "100일 실행 계획 보고 완료", "status": "done"},
        ],
    }


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
