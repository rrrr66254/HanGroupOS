"""AI 대화 요약 자동 생성 — 장기 세션을 요약하여 CorporateMemory에 저장."""
from datetime import datetime, timedelta
from core.logging import get_logger

logger = get_logger("chat_summarizer")

SUMMARY_THRESHOLD = 10  # 최소 메시지 수


def summarize_long_sessions(db, days: int = 7, min_messages: int = SUMMARY_THRESHOLD):
    """장기 채팅 세션을 요약하여 CorporateMemory에 자동 저장.

    Returns: 요약 생성된 세션 수
    """
    from models.models import ChatSession, ChatMessage, CorporateMemory
    from services.ai_provider import AIProvider

    since = datetime.utcnow() - timedelta(days=days)
    sessions = db.query(ChatSession).filter(
        ChatSession.created_at >= since,
    ).all()

    summarized = 0
    for session in sessions:
        messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session.id,
        ).order_by(ChatMessage.created_at.asc()).all()

        if len(messages) < min_messages:
            continue

        # 이미 요약이 있는지 확인
        existing = db.query(CorporateMemory).filter(
            CorporateMemory.memory_type == "chat_summary",
            CorporateMemory.title.like(f"%세션#{session.id}%"),
        ).first()
        if existing:
            continue

        # 대화 내용 조합 (최대 3000자)
        conversation = []
        for m in messages:
            prefix = m.sender_name or m.role
            conversation.append(f"[{prefix}]: {m.content[:200]}")
        conv_text = "\n".join(conversation)[:3000]

        # AI 요약 생성
        try:
            provider = AIProvider()
            summary = provider.chat(
                messages=[{"role": "user", "content": f"다음 대화를 3~5문장으로 핵심 요약하세요. 주요 결정사항과 액션아이템을 포함하세요.\n\n{conv_text}"}],
                system="당신은 기업 대화 요약 전문가입니다. 핵심만 간결하게 요약하세요.",
                session_type="auto_summary",
                agent_name="summarizer",
                max_tokens=512,
            )
        except Exception as e:
            logger.warning("세션 %d 요약 실패: %s", session.id, e)
            continue

        # CorporateMemory에 저장
        title = f"[대화 요약] 세션#{session.id} — {session.title}"
        db.add(CorporateMemory(
            company_id=session.company_id,
            title=title[:200],
            content=summary,
            memory_type="chat_summary",
            tags=["auto_summary", session.session_type],
            importance="normal",
        ))
        summarized += 1

    if summarized > 0:
        db.commit()
    logger.info("대화 요약 완료: %d건", summarized)
    return summarized


def summarize_single_session(session_id: int, db) -> str:
    """단일 세션 즉시 요약 (API용)."""
    from models.models import ChatSession, ChatMessage
    from services.ai_provider import AIProvider

    session = db.query(ChatSession).get(session_id)
    if not session:
        return ""

    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id,
    ).order_by(ChatMessage.created_at.asc()).all()

    if len(messages) < 3:
        return "대화가 너무 짧아 요약할 수 없습니다."

    conversation = []
    for m in messages:
        prefix = m.sender_name or m.role
        conversation.append(f"[{prefix}]: {m.content[:200]}")
    conv_text = "\n".join(conversation)[:3000]

    provider = AIProvider()
    return provider.chat(
        messages=[{"role": "user", "content": f"다음 대화를 3~5문장으로 핵심 요약하세요.\n\n{conv_text}"}],
        system="당신은 기업 대화 요약 전문가입니다.",
        session_type="manual_summary",
        agent_name="summarizer",
        max_tokens=512,
    )
