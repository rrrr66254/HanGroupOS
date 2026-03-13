"""계열사 간 시너지 매칭 AI — 역량/필요 분석 + 협업 기회 자동 추천."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from models.models import Company, CompanyCapability, OrgNode
from core.logging import get_logger

logger = get_logger("synergy_match")

router = APIRouter(prefix="/api/synergy-match", tags=["synergy-match"])


@router.get("/opportunities")
def find_opportunities(db: Session = Depends(get_db)):
    """계열사 간 시너지 기회 자동 분석."""
    companies = db.query(Company).filter(
        Company.status == "active", Company.is_competitor == False,
    ).all()

    if len(companies) < 2:
        return {"opportunities": [], "company_profiles": []}

    # 각 계열사 프로필 구축
    profiles = []
    for c in companies:
        caps = db.query(CompanyCapability).filter(
            CompanyCapability.company_id == c.id,
            CompanyCapability.status == "active",
        ).all()
        agents = db.query(OrgNode).filter(
            OrgNode.company_id == c.id, OrgNode.is_active == True,
        ).all()
        roles = [a.role for a in agents]
        cap_names = [cap.capability_name for cap in caps]

        profiles.append({
            "company_id": c.id,
            "name": c.name,
            "industry": c.industry,
            "description": c.description,
            "vision": c.vision,
            "capabilities": cap_names,
            "roles": roles,
            "agent_count": len(agents),
        })

    # 시너지 기회 분석 (키워드 기반)
    opportunities = _match_synergies(profiles)

    return {
        "opportunities": opportunities,
        "company_profiles": profiles,
        "total_companies": len(profiles),
    }


@router.post("/ai-analyze")
def ai_analyze(db: Session = Depends(get_db)):
    """AI를 활용한 심층 시너지 분석."""
    companies = db.query(Company).filter(
        Company.status == "active", Company.is_competitor == False,
    ).all()

    if len(companies) < 2:
        return {"analysis": "분석할 계열사가 2개 이상 필요합니다."}

    profiles_text = []
    for c in companies:
        caps = db.query(CompanyCapability).filter(
            CompanyCapability.company_id == c.id, CompanyCapability.status == "active",
        ).all()
        cap_names = ", ".join(cap.capability_name for cap in caps) or "미등록"
        profiles_text.append(
            f"- {c.name} ({c.industry}): {c.description[:200]}. 역량: {cap_names}"
        )

    from services.ai_provider import AIProvider
    provider = AIProvider()
    prompt = (
        "다음 계열사 목록을 분석하여 시너지 기회를 찾아주세요.\n\n"
        + "\n".join(profiles_text) + "\n\n"
        "각 시너지 기회에 대해:\n"
        "1. 참여 계열사\n"
        "2. 시너지 유형 (기술/데이터/인력/고객/비용)\n"
        "3. 구체적 협업 방안\n"
        "4. 예상 효과\n"
        "를 구조적으로 제시하세요."
    )
    analysis = provider.chat(
        messages=[{"role": "user", "content": prompt}],
        system="당신은 기업 시너지 전략 전문가입니다. 실질적이고 구체적인 협업 기회를 분석하세요.",
        session_type="synergy_analysis",
        agent_name="synergy_analyzer",
        max_tokens=1500,
    )

    return {"analysis": analysis, "company_count": len(companies)}


# ── 키워드 기반 시너지 매칭 ──────────────────────────────────────────────────

SYNERGY_RULES = {
    "tech_data": {
        "keywords_a": ["소프트웨어", "AI", "데이터", "개발", "플랫폼", "tech", "software"],
        "keywords_b": ["마케팅", "미디어", "콘텐츠", "광고", "커머스"],
        "type": "기술-데이터",
        "description": "기술 역량과 마케팅/콘텐츠 데이터를 결합한 디지털 시너지",
    },
    "content_platform": {
        "keywords_a": ["게임", "엔터", "미디어", "콘텐츠", "영상"],
        "keywords_b": ["플랫폼", "소프트웨어", "AI", "클라우드"],
        "type": "콘텐츠-플랫폼",
        "description": "콘텐츠 제작과 기술 플랫폼을 결합한 서비스 시너지",
    },
    "finance_ops": {
        "keywords_a": ["금융", "투자", "보험", "핀테크"],
        "keywords_b": ["운영", "물류", "커머스", "소매"],
        "type": "금융-운영",
        "description": "금융 서비스와 운영/물류의 비용 최적화 시너지",
    },
    "cross_customer": {
        "keywords_a": ["B2C", "소비자", "리테일", "소매", "고객"],
        "keywords_b": ["B2B", "기업", "솔루션", "SaaS", "서비스"],
        "type": "고객 교차",
        "description": "B2C-B2B 고객 기반을 교차 활용한 매출 시너지",
    },
}


def _match_synergies(profiles: list) -> list:
    """프로필 간 키워드 매칭으로 시너지 기회 탐색."""
    opportunities = []
    seen = set()

    for i, p1 in enumerate(profiles):
        text1 = f"{p1['industry']} {p1['description']} {' '.join(p1['capabilities'])}".lower()
        for j, p2 in enumerate(profiles):
            if i >= j:
                continue
            pair_key = f"{p1['company_id']}-{p2['company_id']}"
            if pair_key in seen:
                continue

            text2 = f"{p2['industry']} {p2['description']} {' '.join(p2['capabilities'])}".lower()

            for rule_key, rule in SYNERGY_RULES.items():
                score_a1 = sum(1 for kw in rule["keywords_a"] if kw.lower() in text1)
                score_b1 = sum(1 for kw in rule["keywords_b"] if kw.lower() in text2)
                score_a2 = sum(1 for kw in rule["keywords_a"] if kw.lower() in text2)
                score_b2 = sum(1 for kw in rule["keywords_b"] if kw.lower() in text1)

                score = max(score_a1 + score_b1, score_a2 + score_b2)
                if score >= 2:
                    seen.add(pair_key)
                    opportunities.append({
                        "company_a": {"id": p1["company_id"], "name": p1["name"]},
                        "company_b": {"id": p2["company_id"], "name": p2["name"]},
                        "synergy_type": rule["type"],
                        "description": rule["description"],
                        "match_score": min(score / 4, 1.0),
                    })
                    break

    opportunities.sort(key=lambda x: x["match_score"], reverse=True)
    return opportunities
