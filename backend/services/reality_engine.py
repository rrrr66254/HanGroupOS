"""
Reality Context Engine
======================
AI가 대답하기 전에 실제 DB 데이터를 시스템 컨텍스트로 주입합니다.
거짓 데이터 생성을 원천 차단하는 RAG(Retrieval-Augmented Generation) 방식.

사용법:
    ctx = build_reality_context(db, session_type="ceo", company_id=3)
    system_prompt = base_system + ctx
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from typing import Optional

# 서비스별 API 키 안내
_SERVICE_GUIDE = {
    "serpapi": {
        "name": "SerpAPI (Google 웹 검색)",
        "url": "https://serpapi.com/",
        "free": "무료 100회/월",
        "signup": "serpapi.com 가입 → Dashboard → API Key 복사",
    },
    "newsapi": {
        "name": "NewsAPI (뉴스 수집)",
        "url": "https://newsapi.org/",
        "free": "무료 100회/일 (개인용)",
        "signup": "newsapi.org 가입 → Get API Key",
    },
    "comtrade": {
        "name": "UN Comtrade (무역 데이터)",
        "url": "https://comtradeplus.un.org/",
        "free": "무료 (1일 500회, 키 없이도 기본 사용 가능)",
        "signup": "comtradeplus.un.org 가입 → Subscription Key",
    },
    "wordpress": {
        "name": "WordPress (블로그 발행)",
        "url": "https://wordpress.org/support/article/application-passwords/",
        "free": "무료 (본인 WordPress 사이트 필요)",
        "signup": "WordPress 관리자 → 사용자 → 프로필 → 애플리케이션 비밀번호 생성",
        "extra_fields": "url(사이트주소), username(사용자명) 도 필요",
    },
    "tistory": {
        "name": "Tistory (블로그 발행)",
        "url": "https://www.tistory.com/guide/api/manage/register",
        "free": "무료",
        "signup": "tistory.com → 관리 → API → 앱 등록 → Access Token 발급",
        "extra_fields": "blog_name(블로그명) 도 필요",
    },
    "blogger": {
        "name": "Google Blogger (블로그 발행)",
        "url": "https://developers.google.com/blogger",
        "free": "무료",
        "signup": "Google Cloud Console → OAuth 2.0 → Blogger API 활성화",
        "extra_fields": "blog_id, oauth_token 필요",
    },
    "youtube": {
        "name": "YouTube (영상 업로드)",
        "url": "https://developers.google.com/youtube/v3",
        "free": "무료 (일일 할당량 있음)",
        "signup": "Google Cloud Console → YouTube Data API v3 활성화 → OAuth 2.0 인증",
        "extra_fields": "POST /api/media/youtube/auth-url 로 OAuth 인증 URL 생성",
    },
}


def build_reality_context(
    db: Session,
    session_type: str,
    company_id: Optional[int] = None,
) -> str:
    """
    세션 타입과 회사 ID에 맞는 실제 DB 데이터를 수집해
    AI 시스템 프롬프트에 삽입할 컨텍스트 블록을 반환합니다.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if session_type == "chairman":
        return _build_chairman_context(db, now)
    elif session_type in ("ceo", "committee") and company_id:
        return _build_ceo_context(db, company_id, now)
    return ""


def build_api_key_context(db: Session) -> str:
    """등록된 외부 API 키 현황을 AI 컨텍스트로 반환."""
    from models.models import ExternalApiKey
    registered = {
        row.service: row.label or row.service
        for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all()
    }
    lines = ["\n[외부 API 키 현황]"]
    for svc, guide in _SERVICE_GUIDE.items():
        status = f"✅ 등록됨 ({registered[svc]})" if svc in registered else "❌ 미등록"
        lines.append(f"  - {guide['name']}: {status}")
    lines.append(
        "\n[API 키 등록 방법 — 채팅에서 직접 입력 가능]\n"
        "  사용자가 API 키를 입력하면 반드시 <<SAVE_API_KEY:{...}>> 블록을 생성해 저장하세요.\n"
        "  형식: <<SAVE_API_KEY:{\"service\":\"serpapi\",\"api_key\":\"실제키값\",\"label\":\"이름\",\"extra_config\":{}}>>"
    )
    return "\n".join(lines)


# ── Chairman context ──────────────────────────────────────────────────────────

def _build_chairman_context(db: Session, now: str) -> str:
    from models.models import (
        Company, OrgNode, ChatSession, ChatMessage,
        StrategyItem, TerminalRequest, ApprovalRequest,
    )

    companies = db.query(Company).filter(Company.status == "active").all()
    total_nodes = db.query(OrgNode).filter(OrgNode.company_id.isnot(None)).count()
    total_msgs = db.query(ChatMessage).count()

    strategy_items = db.query(StrategyItem).filter(StrategyItem.company_id.is_(None)).all()
    pending_approvals = db.query(ApprovalRequest).filter(ApprovalRequest.status == "pending").count()
    pending_terminals = db.query(TerminalRequest).filter(TerminalRequest.status == "pending").count()

    company_lines = []
    for c in companies[:20]:  # max 20
        ceo = db.query(OrgNode).filter(
            OrgNode.company_id == c.id, OrgNode.level == "ceo"
        ).first()
        sessions = db.query(ChatSession).filter(ChatSession.company_id == c.id).all()
        msg_count = 0
        if sessions:
            from sqlalchemy import func
            sids = [s.id for s in sessions]
            msg_count = db.query(ChatMessage).filter(ChatMessage.session_id.in_(sids)).count()
        company_lines.append(
            f"  - {c.name} ({c.industry}) | CEO: {ceo.name if ceo else '미배정'} | 대화: {msg_count}건"
        )

    strategy_lines = [
        f"  - [{s.item_type}] {s.title} (진행률: {s.progress}%)"
        for s in strategy_items[:10]
    ]

    lines = [
        f"\n\n{'='*60}",
        f"[실제 그룹 현황 데이터 — {now}]",
        f"{'='*60}",
        f"▶ 활성 계열사: {len(companies)}개",
        f"▶ 총 조직원 수: {total_nodes}명",
        f"▶ 누적 AI 대화: {total_msgs}건",
        f"▶ 대기 중 승인 요청: {pending_approvals}건",
        f"▶ 대기 중 터미널 요청: {pending_terminals}건",
        "",
        "▶ 계열사 목록:",
    ]
    lines += (company_lines if company_lines else ["  (없음)"])

    if strategy_lines:
        lines += ["", "▶ 그룹 전략 현황:"]
        lines += strategy_lines

    # API key status
    from models.models import ExternalApiKey
    registered_svcs = {
        row.service for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all()
    }
    missing = [g["name"] for s, g in _SERVICE_GUIDE.items() if s not in registered_svcs]
    api_lines = []
    if missing:
        api_lines = [
            "",
            "▶ 미등록 외부 API (데이터 수집/발행 기능 제한):",
        ] + [f"  - {n}" for n in missing]
    else:
        api_lines = ["", "▶ 모든 외부 API 키 등록 완료"]

    lines += api_lines
    lines += [
        f"{'='*60}",
        "⚠ 위 데이터는 실제 DB에서 조회한 수치입니다.",
        "위 데이터에 없는 정보는 '확인되지 않은 정보입니다'라고 명시하세요.",
        f"{'='*60}\n",
    ]
    return "\n".join(lines)


# ── CEO context ───────────────────────────────────────────────────────────────

def _build_ceo_context(db: Session, company_id: int, now: str) -> str:
    from models.models import (
        Company, OrgNode, ChatSession, ChatMessage,
        StrategyItem, TerminalRequest, MarketReport,
    )

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return ""

    # Org nodes
    nodes = db.query(OrgNode).filter(OrgNode.company_id == company_id).all()
    node_by_level: dict[str, list] = {}
    for n in nodes:
        node_by_level.setdefault(n.level, []).append(n.name)

    # Chat history stats
    sessions = db.query(ChatSession).filter(ChatSession.company_id == company_id).all()
    sids = [s.id for s in sessions]
    msg_count = db.query(ChatMessage).filter(ChatMessage.session_id.in_(sids)).count() if sids else 0

    # Strategy
    strategies = db.query(StrategyItem).filter(StrategyItem.company_id == company_id).all()

    # Terminal requests
    terminal_pending = db.query(TerminalRequest).filter(
        TerminalRequest.company_id == company_id,
        TerminalRequest.status == "pending",
    ).count()
    terminal_executed = db.query(TerminalRequest).filter(
        TerminalRequest.company_id == company_id,
        TerminalRequest.status == "executed",
    ).all()

    # Latest market report
    market = db.query(MarketReport).filter(
        MarketReport.company_id == company_id
    ).order_by(MarketReport.created_at.desc()).first()

    # Build node lines
    level_labels = {
        "ceo": "CEO", "chief": "임원", "team_lead": "팀장", "specialist": "전문가",
    }
    node_lines = []
    for level, label in level_labels.items():
        names = node_by_level.get(level, [])
        if names:
            node_lines.append(f"  - {label}: {', '.join(names)}")

    strategy_lines = [
        f"  - [{s.item_type}] {s.title} (진행률: {s.progress}%)"
        for s in strategies[:8]
    ]

    # Recent executed terminal commands
    exec_lines = [
        f"  - `{t.command}` → exit {t.exit_code} ({t.executed_at.strftime('%m-%d %H:%M') if t.executed_at else '?'})"
        for t in terminal_executed[-5:]
    ]

    lines = [
        f"\n\n{'='*60}",
        f"[실제 회사 데이터 — {company.name} — {now}]",
        f"{'='*60}",
        f"▶ 회사명: {company.name}",
        f"▶ 산업: {company.industry}",
        f"▶ 설명: {company.description or '(없음)'}",
        f"▶ 비전: {company.vision or '(없음)'}",
        f"▶ 설립일: {company.created_at.strftime('%Y-%m-%d')}",
        "",
        f"▶ 조직 현황 (총 {len(nodes)}명):",
    ]
    lines += (node_lines if node_lines else ["  (조직 없음)"])

    if strategy_lines:
        lines += ["", f"▶ 전략 아이템 ({len(strategies)}건):"]
        lines += strategy_lines
    else:
        lines.append("▶ 전략 아이템: 없음")

    lines += [
        "",
        f"▶ 누적 AI 대화: {msg_count}건",
        f"▶ 대기 중 터미널 요청: {terminal_pending}건",
    ]

    if exec_lines:
        lines += ["▶ 최근 실행된 명령:"]
        lines += exec_lines

    if market:
        lines += [
            "",
            f"▶ 최신 시장분석 ({market.created_at.strftime('%Y-%m-%d')}): {market.title}",
            f"   요약: {market.summary[:120]}..." if len(market.summary) > 120 else f"   요약: {market.summary}",
        ]

    lines += [
        "",
        f"{'='*60}",
        "⚠ 위 데이터는 실제 DB에서 조회한 수치입니다.",
        "위 데이터에 없는 정보(서버 상태, 매출, 트래픽 등)는",
        "'실시간 데이터에 접근할 수 없어 확인이 어렵습니다'라고 명시하세요.",
        f"{'='*60}\n",
    ]
    return "\n".join(lines)
