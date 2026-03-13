"""
에이전트 자동 위임 체인 (Delegation Chain)
==========================================
CEO가 처리 못 하는 전문 질문을 CTO/CFO/CMO 등에게 자동 위임하고
결과를 종합 보고하는 체인 워크플로우.

흐름:
1. 사용자 질문 → CEO가 1차 응답 + 위임 판단
2. 전문 분야 키워드 감지 → 해당 C-level에게 자동 위임
3. 위임된 에이전트들이 병렬 응답
4. CEO가 모든 응답 종합하여 최종 보고
"""
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

# 전문 분야 키워드 → 위임 대상 매핑
DELEGATION_RULES: Dict[str, Dict[str, Any]] = {
    "cto": {
        "keywords": ["기술", "개발", "코드", "서버", "인프라", "보안", "클라우드", "아키텍처",
                      "AI", "머신러닝", "데이터베이스", "API", "배포", "DevOps", "tech", "software"],
        "role": "CTO (기술총괄)",
    },
    "cfo": {
        "keywords": ["재무", "예산", "매출", "비용", "투자", "ROI", "회계", "자금", "현금흐름",
                      "손익", "재무제표", "수익", "finance", "budget", "revenue"],
        "role": "CFO (재무총괄)",
    },
    "cmo": {
        "keywords": ["마케팅", "브랜드", "광고", "고객", "캠페인", "SNS", "콘텐츠", "SEO",
                      "시장", "타겟", "프로모션", "marketing", "brand", "customer"],
        "role": "CMO (마케팅총괄)",
    },
    "coo": {
        "keywords": ["운영", "프로세스", "효율", "공급망", "파트너", "물류", "OKR", "KPI",
                      "자동화", "워크플로우", "operation", "process"],
        "role": "COO (운영총괄)",
    },
    "cpo": {
        "keywords": ["제품", "UX", "UI", "기능", "로드맵", "사용자경험", "출시", "MVP",
                      "프로토타입", "스프린트", "product", "feature", "roadmap"],
        "role": "CPO (제품총괄)",
    },
}


@dataclass
class DelegationResult:
    """위임 체인 실행 결과."""
    question: str
    ceo_initial: str
    delegated_to: List[str]
    expert_responses: Dict[str, str]
    final_summary: str
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


def detect_delegation_targets(question: str) -> List[str]:
    """질문에서 전문 분야 키워드를 감지하여 위임 대상 목록 반환."""
    q_lower = question.lower()
    targets = []
    for key, rule in DELEGATION_RULES.items():
        score = sum(1 for kw in rule["keywords"] if kw.lower() in q_lower)
        if score >= 1:
            targets.append((key, score))
    # 점수 높은 순, 최대 3명까지
    targets.sort(key=lambda x: x[1], reverse=True)
    return [t[0] for t in targets[:3]]


async def run_delegation_chain(
    question: str,
    company_id: int,
    db_session,
) -> DelegationResult:
    """위임 체인 실행: CEO 초기 → 전문가 병렬 → CEO 종합."""
    from services.ai_provider import AIProvider, get_system_for_role, _resolve_group
    from models.models import OrgNode

    # 회사의 에이전트 목록 조회
    agents = db_session.query(OrgNode).filter(
        OrgNode.company_id == company_id,
        OrgNode.is_active == True,
    ).all()

    agent_map = {}
    for a in agents:
        role_key = (a.role or "").lower()
        for dk in DELEGATION_RULES:
            if dk in role_key:
                agent_map[dk] = a
        if "ceo" in role_key or a.level == "CEO":
            agent_map["ceo"] = a

    # Step 1: CEO 초기 판단
    ceo_provider = AIProvider()
    ceo_system = get_system_for_role("CEO", "CEO", db_session)
    ceo_initial = ceo_provider.chat(
        messages=[{"role": "user", "content": question}],
        system=ceo_system + "\n\n이 질문에 대해 간략히 답변하고, 전문적 분석이 필요한 부분을 지적하세요.",
        session_type="delegation",
        agent_name="CEO",
        company_id=company_id,
    )

    # Step 2: 키워드 기반 위임 대상 감지
    targets = detect_delegation_targets(question)
    if not targets:
        return DelegationResult(
            question=question,
            ceo_initial=ceo_initial,
            delegated_to=[],
            expert_responses={},
            final_summary=ceo_initial,
        )

    # Step 3: 전문가 병렬 응답
    loop = asyncio.get_event_loop()
    expert_responses: Dict[str, str] = {}

    async def _get_expert_response(role_key: str):
        provider = AIProvider()
        system = get_system_for_role(
            DELEGATION_RULES[role_key]["role"], "Chief", db_session,
        )
        prompt = (
            f"CEO가 다음 질문에 대해 전문 분석을 요청했습니다.\n\n"
            f"질문: {question}\n\n"
            f"CEO 의견: {ceo_initial[:500]}\n\n"
            f"당신의 전문 분야 관점에서 구체적으로 분석하고 권고사항을 제시하세요."
        )
        resp = await loop.run_in_executor(
            None, provider.chat,
            [{"role": "user", "content": prompt}],
            system, "delegation", 1024,
            DELEGATION_RULES[role_key]["role"], "", 0, company_id,
        )
        expert_responses[role_key] = resp

    tasks = [_get_expert_response(t) for t in targets]
    await asyncio.gather(*tasks)

    # Step 4: CEO 종합 보고
    expert_summary_parts = []
    for role_key, resp in expert_responses.items():
        label = DELEGATION_RULES[role_key]["role"]
        expert_summary_parts.append(f"[{label}]\n{resp}")
    expert_text = "\n\n".join(expert_summary_parts)

    final_prompt = (
        f"원래 질문: {question}\n\n"
        f"각 전문가의 분석 결과입니다:\n\n{expert_text}\n\n"
        f"위 전문가 의견을 종합하여 최종 보고서를 작성하세요. "
        f"핵심 결론과 실행 권고사항을 포함하세요."
    )
    final_summary = ceo_provider.chat(
        messages=[{"role": "user", "content": final_prompt}],
        system=ceo_system,
        session_type="delegation_summary",
        agent_name="CEO",
        company_id=company_id,
    )

    return DelegationResult(
        question=question,
        ceo_initial=ceo_initial,
        delegated_to=targets,
        expert_responses=expert_responses,
        final_summary=final_summary,
    )
