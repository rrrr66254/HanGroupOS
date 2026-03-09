import re
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db, SessionLocal
from core.security import get_current_user
from models.models import ChatSession, ChatMessage, User, AISuggestion, Company, OrgNode, StrategyItem
from schemas.schemas import (
    ChatSessionCreate, ChatSessionOut,
    ChatMessageOut, ChatRequest, CompanyQueryRequest,
    ConfirmCompanyRequest, BriefCeoRequest, CollaborateRequest,
    MultiCeoMeetingRequest,
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


@router.get("/group-kpi")
def group_kpi(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return AI activity KPI metrics for every active company."""
    companies = db.query(Company).filter(Company.status == "active").all()
    result = []
    for company in companies:
        sessions = db.query(ChatSession).filter(ChatSession.company_id == company.id).all()
        session_ids = [s.id for s in sessions]
        msg_count = (
            db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).count()
            if session_ids else 0
        )
        node_count = db.query(OrgNode).filter(OrgNode.company_id == company.id).count()
        strategy_count = db.query(StrategyItem).filter(StrategyItem.company_id == company.id).count()
        ai_score = min(100, msg_count * 5 + node_count * 3 + strategy_count * 10)
        result.append({
            "id": company.id,
            "name": company.name,
            "industry": company.industry,
            "ai_messages": msg_count,
            "org_nodes": node_count,
            "strategies": strategy_count,
            "ai_score": ai_score,
        })

    total_msgs = sum(r["ai_messages"] for r in result)
    avg_score = round(sum(r["ai_score"] for r in result) / len(result), 1) if result else 0
    return {
        "companies": sorted(result, key=lambda r: r["ai_score"], reverse=True),
        "totals": {
            "total_companies": len(result),
            "total_ai_messages": total_msgs,
            "avg_ai_score": avg_score,
        },
    }


@router.post("/collaborate")
def collaborate(
    req: CollaborateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Have two company CEOs collaborate on a task assigned by the chairman."""
    company_a = db.query(Company).filter(Company.id == req.company_a_id).first()
    company_b = db.query(Company).filter(Company.id == req.company_b_id).first()
    if not company_a or not company_b:
        raise HTTPException(404, "Company not found")

    ceo_a = db.query(OrgNode).filter(OrgNode.company_id == req.company_a_id, OrgNode.level == "ceo").first()
    ceo_b = db.query(OrgNode).filter(OrgNode.company_id == req.company_b_id, OrgNode.level == "ceo").first()
    ceo_a_name = ceo_a.name if ceo_a else f"{company_a.name} CEO"
    ceo_b_name = ceo_b.name if ceo_b else f"{company_b.name} CEO"

    provider = get_provider_from_db(db, current_user.id)

    # Step 1: CEO A proposes its role
    prompt_a = (
        f"한그룹 회장의 협업 과제입니다.\n\n"
        f"협업 과제: {req.task}\n\n"
        f"협업 파트너: {company_b.name} ({company_b.industry})\n\n"
        f"{company_a.name}의 CEO로서 이 협업에서 귀사의 역할, 강점, 구체적인 기여 방안을 제시해주세요. "
        f"간결하게 작성해주세요."
    )
    response_a = provider.chat([{"role": "user", "content": prompt_a}], system=CEO_SYSTEM, session_type="ceo")

    # Step 2: CEO B responds, seeing CEO A's proposal
    prompt_b = (
        f"한그룹 회장의 협업 과제입니다.\n\n"
        f"협업 과제: {req.task}\n\n"
        f"협업 파트너: {company_a.name} ({company_a.industry})\n\n"
        f"{ceo_a_name}의 제안:\n{response_a}\n\n"
        f"{company_b.name}의 CEO로서 위 제안을 바탕으로 귀사의 역할, 보완점, 공동 실행 계획을 제시해주세요. "
        f"간결하게 작성해주세요."
    )
    response_b = provider.chat([{"role": "user", "content": prompt_b}], system=CEO_SYSTEM, session_type="ceo")

    # Step 3: Synthesize combined plan
    prompt_combined = (
        f"다음 두 CEO의 협업 제안을 종합하여 최종 공동 실행 계획을 작성해주세요.\n\n"
        f"[{ceo_a_name}]\n{response_a}\n\n"
        f"[{ceo_b_name}]\n{response_b}\n\n"
        f"명확하고 실행 가능한 공동 계획을 번호 목록으로 작성해주세요."
    )
    combined = provider.chat([{"role": "user", "content": prompt_combined}], system=CHAIRMAN_SYSTEM, session_type="chairman")

    return {
        "company_a": {"id": company_a.id, "name": company_a.name},
        "company_b": {"id": company_b.id, "name": company_b.name},
        "ceo_a_name": ceo_a_name,
        "ceo_b_name": ceo_b_name,
        "response_a": response_a,
        "response_b": response_b,
        "combined": combined,
        "delegation": [
            {"from": "회장", "to": ceo_a_name, "message": f"협업 과제 전달: {req.task[:28]}…", "status": "done"},
            {"from": ceo_a_name, "to": ceo_b_name, "message": "역할 및 협업 방안 제안", "status": "done"},
            {"from": ceo_b_name, "to": ceo_a_name, "message": "보완 및 공동 계획 수립", "status": "done"},
            {"from": ceo_a_name, "to": "회장", "message": "최종 공동 실행 계획 보고", "status": "done"},
        ],
    }


@router.get("/timeline")
def timeline(
    limit: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Aggregate recent events across the group into a chronological activity feed."""
    from datetime import timezone
    events = []

    # Company creations
    for c in db.query(Company).order_by(Company.created_at.desc()).limit(15).all():
        events.append({
            "type": "company_created", "icon": "🏢",
            "title": f"계열사 설립: {c.name}",
            "description": f"{c.industry}" + (f" · {c.description[:40]}" if c.description else ""),
            "created_at": c.created_at.isoformat(),
        })

    # CEO sessions (new CEO briefings)
    for s in db.query(ChatSession).filter(ChatSession.session_type == "ceo").order_by(ChatSession.created_at.desc()).limit(15).all():
        co_name = ""
        if s.company_id:
            co = db.query(Company).filter(Company.id == s.company_id).first()
            co_name = co.name if co else ""
        events.append({
            "type": "ceo_briefing", "icon": "🤵",
            "title": f"CEO 브리핑: {co_name}",
            "description": s.title or "CEO 세션 시작",
            "created_at": s.created_at.isoformat(),
        })

    # Chairman directives (user messages in chairman sessions)
    rows = (
        db.query(ChatMessage)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.session_type == "chairman", ChatMessage.role == "user")
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
        .all()
    )
    for m in rows:
        snippet = m.content[:55] + "…" if len(m.content) > 55 else m.content
        events.append({
            "type": "directive", "icon": "👔",
            "title": "회장 지시",
            "description": snippet,
            "created_at": m.created_at.isoformat(),
        })

    # Strategy items
    for s in db.query(StrategyItem).order_by(StrategyItem.created_at.desc()).limit(10).all():
        events.append({
            "type": "strategy", "icon": "🎯",
            "title": f"전략 수립: {s.title}",
            "description": f"{s.item_type} · 우선순위 {s.priority}",
            "created_at": s.created_at.isoformat(),
        })

    events.sort(key=lambda e: e["created_at"], reverse=True)
    return events[:limit]


@router.post("/multi-ceo-meeting")
def multi_ceo_meeting(
    req: MultiCeoMeetingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Simulate a multi-CEO strategy meeting and return transcript + minutes."""
    companies = [db.query(Company).filter(Company.id == int(cid)).first() for cid in req.company_ids]
    companies = [c for c in companies if c]
    if len(companies) < 2:
        raise HTTPException(400, "최소 2개 회사가 필요합니다")

    participants = []
    for company in companies:
        node = db.query(OrgNode).filter(OrgNode.company_id == company.id, OrgNode.level == "ceo").first()
        participants.append((company, node.name if node else f"{company.name} CEO"))

    provider = get_provider_from_db(db, current_user.id)

    context_header = (
        f"한그룹 회장 주재 긴급 경영진 회의\n"
        f"안건: {req.topic}\n"
        f"참석자: {', '.join(f'{name}({co.name})' for co, name in participants)}\n\n"
    )
    transcript = []
    accumulated = ""

    for co, ceo_name in participants:
        prompt = (
            f"{context_header}"
            f"{'이전 발언:\n' + accumulated + chr(10) if accumulated else ''}"
            f"[{ceo_name} / {co.name} CEO] 발언 순서입니다. "
            f"안건에 대한 귀사의 입장과 제안을 3~4문장으로 간결하게 발표해주세요."
        )
        speech = provider.chat([{"role": "user", "content": prompt}], system=CEO_SYSTEM, session_type="ceo")
        transcript.append({"ceo_name": ceo_name, "company": co.name, "industry": co.industry, "speech": speech})
        accumulated += f"[{ceo_name}]: {speech}\n\n"

    minutes_prompt = (
        f"다음 경영진 회의 내용을 바탕으로 공식 회의록을 작성해주세요.\n\n"
        f"안건: {req.topic}\n\n발언 내용:\n{accumulated}\n\n"
        f"주요 결정사항, 각사 역할 분담, 후속 액션 아이템을 포함하여 "
        f"구체적이고 실행 가능한 회의록을 작성해주세요."
    )
    minutes = provider.chat([{"role": "user", "content": minutes_prompt}], system=CHAIRMAN_SYSTEM, session_type="chairman")

    return {
        "topic": req.topic,
        "transcript": transcript,
        "minutes": minutes,
        "participants": [{"company": co.name, "ceo_name": name} for co, name in participants],
    }


@router.get("/performance-report")
def performance_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate AI-powered weekly performance ranking and analysis for all companies."""
    companies = db.query(Company).filter(Company.status == "active").all()
    rankings = []
    for company in companies:
        sessions = db.query(ChatSession).filter(ChatSession.company_id == company.id).all()
        session_ids = [s.id for s in sessions]
        msg_count = (
            db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).count()
            if session_ids else 0
        )
        node_count = db.query(OrgNode).filter(OrgNode.company_id == company.id).count()
        strategy_count = db.query(StrategyItem).filter(StrategyItem.company_id == company.id).count()
        ai_score = min(100, msg_count * 5 + node_count * 3 + strategy_count * 10)
        rankings.append({
            "name": company.name,
            "industry": company.industry,
            "ai_messages": msg_count,
            "org_nodes": node_count,
            "strategies": strategy_count,
            "ai_score": ai_score,
        })

    rankings.sort(key=lambda x: x["ai_score"], reverse=True)

    analysis = "계열사 데이터가 없습니다."
    if rankings:
        report_lines = "\n".join(
            f"{i+1}위. {r['name']} ({r['industry']}): 점수 {r['ai_score']}, "
            f"AI 대화 {r['ai_messages']}회, 조직 {r['org_nodes']}명, 전략 {r['strategies']}개"
            for i, r in enumerate(rankings)
        )
        prompt = (
            f"다음은 한그룹 계열사 AI 활동 주간 현황입니다.\n\n{report_lines}\n\n"
            f"각 계열사의 성과를 분석하고 강점과 개선점을 포함한 주간 성과 보고서를 작성해주세요. "
            f"상위 계열사의 성공 요인과 하위 계열사에 대한 구체적인 권고사항을 포함해주세요."
        )
        provider = get_provider_from_db(db, current_user.id)
        analysis = provider.chat([{"role": "user", "content": prompt}], system=CHAIRMAN_SYSTEM, session_type="chairman")

    return {"rankings": rankings, "analysis": analysis}


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
