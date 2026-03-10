"""
회사 역량 자동 분석 서비스
===========================
회사 생성 시 업종/비전을 분석해 필요 역량을 파악하고
CompanyCapability(pending) + ApprovalRequest를 자동 생성.
회장 승인 시 activate_capabilities()로 역량을 active 전환.
"""
from datetime import datetime
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from models.models import Company, CompanyCapability, ApprovalRequest

# ── 게임 역량 공유 리스트 (중복 방지) ─────────────────────────────────────────
_GAME_CAPS: List[str] = [
    "game_upload",
    "game_analytics",
    "game_trend_search",
    "game_idea_generator",
]

# ── 업종 → 필요 역량 매핑 ────────────────────────────────────────────────────
INDUSTRY_CAPABILITIES: Dict[str, List[str]] = {
    "게임":       _GAME_CAPS,
    "게임개발":   _GAME_CAPS,
    "게임 개발":  _GAME_CAPS,
    "미디어":     ["blog_publish", "youtube_upload", "news_collection"],
    "소프트웨어": ["web_scraping", "api_integration", "code_execution"],
    "데이터":     ["trade_data", "news_collection", "web_scraping"],
    "금융":       ["trade_data", "market_analysis"],
    "교육":       ["content_creation", "web_presence"],
    "general":    ["web_presence"],
}

# ── 역량별 메타 정보 ──────────────────────────────────────────────────────────
CAPABILITY_META: Dict[str, Dict] = {
    "game_upload": {
        "name": "게임 업로드 관리",
        "description": "Itch.io, Steam 등 플랫폼에 게임 업로드 및 관리",
        "required_permits": ["게임물관리위원회 등급분류", "개인정보처리방침"],
        "required_apis": ["itchio", "steam_partner"],
    },
    "game_analytics": {
        "name": "게임 플레이 분석",
        "description": "플레이어 수, 리텐션, 수익 등 게임 메트릭 모니터링",
        "required_permits": [],
        "required_apis": ["serpapi"],
    },
    "game_trend_search": {
        "name": "게임 트렌드 검색",
        "description": "Steam, Itch.io, 앱스토어 트렌드 실시간 수집",
        "required_permits": [],
        "required_apis": ["serpapi"],
    },
    "game_idea_generator": {
        "name": "AI 게임 아이디어 생성",
        "description": "트렌드 데이터 기반 AI 신규 게임 아이디어 자동 생성",
        "required_permits": [],
        "required_apis": [],
    },
    "blog_publish": {
        "name": "블로그 발행",
        "description": "WordPress, Tistory, Blogger 등 블로그 플랫폼 자동 발행",
        "required_permits": [],
        "required_apis": ["wordpress", "tistory", "blogger"],
    },
    "youtube_upload": {
        "name": "YouTube 업로드",
        "description": "YouTube 채널에 영상 자동 업로드 및 관리",
        "required_permits": [],
        "required_apis": ["youtube"],
    },
    "news_collection": {
        "name": "뉴스 수집",
        "description": "업종 관련 뉴스 자동 수집 및 분석",
        "required_permits": [],
        "required_apis": ["newsapi", "serpapi"],
    },
    "web_scraping": {
        "name": "웹 스크래핑",
        "description": "경쟁사 및 시장 데이터 자동 수집",
        "required_permits": [],
        "required_apis": [],
    },
    "api_integration": {
        "name": "외부 API 연동",
        "description": "외부 서비스 API 연동 및 자동화",
        "required_permits": [],
        "required_apis": [],
    },
    "code_execution": {
        "name": "코드 실행 환경",
        "description": "Python 코드 실행 및 자동화 파이프라인",
        "required_permits": [],
        "required_apis": [],
    },
    "trade_data": {
        "name": "무역 데이터 수집",
        "description": "UN Comtrade 등 국제 무역 데이터 수집 및 분석",
        "required_permits": [],
        "required_apis": ["comtrade"],
    },
    "market_analysis": {
        "name": "시장 분석",
        "description": "금융 시장 데이터 수집 및 AI 분석",
        "required_permits": [],
        "required_apis": ["serpapi"],
    },
    "content_creation": {
        "name": "콘텐츠 생성",
        "description": "AI 기반 교육 콘텐츠 자동 생성",
        "required_permits": [],
        "required_apis": [],
    },
    "web_presence": {
        "name": "웹 사이트",
        "description": "기업 웹사이트 자동 생성 및 관리",
        "required_permits": [],
        "required_apis": [],
    },
}


def _match_industry(text: str) -> str:
    """텍스트에서 업종 키워드를 찾아 INDUSTRY_CAPABILITIES 키 반환."""
    text_lower = text.lower()
    # 긴 키워드 우선 매칭
    for key in sorted(INDUSTRY_CAPABILITIES.keys(), key=len, reverse=True):
        if key in text_lower:
            return key
    return "general"


def analyze_and_request_capabilities(company_id: int, db: Session) -> Optional[ApprovalRequest]:
    """
    회사 업종/비전 분석 → CompanyCapability(pending) + ApprovalRequest 생성.
    이미 역량 요청이 있으면 스킵.
    반환: 생성된 ApprovalRequest 또는 None
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return None

    # 이미 이 회사에 역량 요청이 있으면 스킵
    existing = db.query(CompanyCapability).filter(
        CompanyCapability.company_id == company_id
    ).first()
    if existing:
        return None

    # 업종 키워드 매칭
    search_text = f"{company.industry} {company.vision or ''} {company.description or ''}"
    industry_key = _match_industry(search_text)
    cap_types = INDUSTRY_CAPABILITIES.get(industry_key, INDUSTRY_CAPABILITIES["general"])

    # AI로 추가 분석 시도 (실패해도 무시)
    ai_permits: List[str] = []
    try:
        from services.ai_provider import AIProvider
        provider = AIProvider()
        import json as _json
        ai_response = provider.chat(
            messages=[{
                "role": "user",
                "content": (
                    f"회사 정보:\n"
                    f"- 이름: {company.name}\n"
                    f"- 업종: {company.industry}\n"
                    f"- 비전: {company.vision}\n\n"
                    "이 회사 운영에 필요한 법적 허가/인증 목록을 JSON 배열로만 답하세요. "
                    "예: [\"허가1\", \"허가2\"] 형식으로 JSON만 출력."
                ),
            }],
            system="당신은 사업 컨설턴트입니다. JSON 배열만 출력하세요.",
        )
        # JSON 파싱 시도
        raw = ai_response.strip()
        start = raw.find("[")
        end = raw.rfind("]")
        if start != -1 and end != -1:
            ai_permits = _json.loads(raw[start:end + 1])
    except Exception as e:
        print(f"[CapabilityAnalyzer] AI 분석 스킵 (무시): {e}")

    # CompanyCapability 레코드 생성 (pending)
    cap_ids = []
    for cap_type in cap_types:
        cap = CompanyCapability(
            company_id=company_id,
            capability_type=cap_type,
            status="pending",
            config=CAPABILITY_META.get(cap_type, {}),
        )
        db.add(cap)
        db.flush()
        cap_ids.append(cap.id)

    # 필요 허가 목록 구성
    all_permits: List[str] = []
    for cap_type in cap_types:
        meta = CAPABILITY_META.get(cap_type, {})
        all_permits.extend(meta.get("required_permits", []))
    all_permits = list(dict.fromkeys(all_permits))  # 중복 제거 (순서 유지)
    if ai_permits:
        for p in ai_permits:
            if p not in all_permits:
                all_permits.append(p)

    # ApprovalRequest 생성 (회장에게)
    cap_names = [CAPABILITY_META.get(c, {}).get("name", c) for c in cap_types]
    permits_str = "\n".join(f"  - {p}" for p in all_permits) if all_permits else "  없음"
    caps_str = "\n".join(f"  - {n}" for n in cap_names)

    approval = ApprovalRequest(
        request_type="capability_update",
        requester="AI 역량 분석기",
        title=f"[{company.name}] 역량 활성화 요청",
        description=(
            f"AI 업종 분석 결과 '{company.name}'에 다음 기능 활성화를 요청합니다.\n\n"
            f"**감지된 업종**: {industry_key}\n\n"
            f"**필요 역량**:\n{caps_str}\n\n"
            f"**필요 허가/인증**:\n{permits_str}\n\n"
            "승인 시 해당 기능이 자동 활성화되며 API 키 설정 안내가 제공됩니다."
        ),
        status="pending",
        company_id=company_id,
        meta={"capability_ids": cap_ids, "cap_types": cap_types},
    )
    db.add(approval)
    db.flush()

    # approval_id를 각 역량에 연결
    for cap_id in cap_ids:
        cap = db.query(CompanyCapability).filter(CompanyCapability.id == cap_id).first()
        if cap:
            cap.approval_id = approval.id

    db.commit()
    print(f"[CapabilityAnalyzer] {company.name} 역량 분석 완료 → 승인 요청 #{approval.id} 생성됨")
    return approval


def activate_capabilities(approval_id: int, db: Session):
    """
    ApprovalRequest 승인 시 연결된 CompanyCapability → 'active'로 전환.
    """
    caps = db.query(CompanyCapability).filter(
        CompanyCapability.approval_id == approval_id
    ).all()

    if not caps:
        return

    for cap in caps:
        cap.status = "active"
        cap.activated_at = datetime.utcnow()

    db.commit()
    print(f"[CapabilityAnalyzer] 승인 #{approval_id} → {len(caps)}개 역량 활성화 완료")
