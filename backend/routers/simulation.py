import json
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import SimulationRun, Company, User
from schemas.schemas import SimulationRequest, SimulationOut, MergerSimRequest
from services.ai_provider import get_provider_from_db

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

MOCK_RESULT = {
    "revenue_projection": {
        "year1": random.randint(500, 2000),
        "year2": random.randint(1000, 5000),
        "year3": random.randint(3000, 15000),
        "unit": "백만원",
    },
    "risk_factors": [
        {"factor": "시장 경쟁 심화", "probability": "중", "impact": "고"},
        {"factor": "기술 변화 속도", "probability": "고", "impact": "중"},
        {"factor": "규제 환경 변화", "probability": "저", "impact": "고"},
    ],
    "success_probability": random.randint(55, 85),
    "key_milestones": [
        {"month": 3, "milestone": "MVP 출시"},
        {"month": 6, "milestone": "첫 100 고객 확보"},
        {"month": 12, "milestone": "손익분기점 달성"},
        {"month": 24, "milestone": "시리즈 A 투자 유치"},
    ],
    "recommendation": "전략적 실행 권장. 초기 6개월 내 시장 검증이 핵심입니다.",
}


@router.post("/run", response_model=SimulationOut)
def run_simulation(
    req: SimulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_provider_from_db(db, current_user.id)

    context = ""
    if req.company_id:
        company = db.query(Company).filter(Company.id == req.company_id).first()
        if company:
            context = f"회사: {company.name} ({company.industry})\n비전: {company.vision}"

    prompt = f"""다음 시나리오를 시뮬레이션하세요:
시나리오: {req.scenario}
{context}
파라미터: {json.dumps(req.parameters, ensure_ascii=False)}

JSON 형식으로 시뮬레이션 결과를 제공하세요:
{{
  "revenue_projection": {{"year1": 숫자, "year2": 숫자, "year3": 숫자, "unit": "백만원"}},
  "risk_factors": [{{"factor": "...", "probability": "저/중/고", "impact": "저/중/고"}}],
  "success_probability": 0-100 정수,
  "key_milestones": [{{"month": 정수, "milestone": "..."}}],
  "recommendation": "..."
}}"""

    messages = [{"role": "user", "content": prompt}]
    raw = provider.chat(messages, system="당신은 비즈니스 시뮬레이션 전문가입니다.", session_type="general")

    result = MOCK_RESULT.copy()
    result["revenue_projection"] = {
        "year1": random.randint(500, 2000),
        "year2": random.randint(1000, 5000),
        "year3": random.randint(3000, 15000),
        "unit": "백만원",
    }
    result["success_probability"] = random.randint(55, 85)

    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
    except Exception:
        pass

    summary = result.get("recommendation", f"시나리오 '{req.scenario}' 시뮬레이션 완료.")

    sim = SimulationRun(
        company_id=req.company_id,
        scenario=req.scenario,
        parameters=req.parameters,
        result=result,
        summary=summary,
        status="completed",
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)
    return sim


@router.get("", response_model=List[SimulationOut])
def list_simulations(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(SimulationRun)
    if company_id:
        q = q.filter(SimulationRun.company_id == company_id)
    return q.order_by(SimulationRun.created_at.desc()).all()


@router.post("/merger")
def merger_simulation(
    req: MergerSimRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI-powered merger/acquisition simulation between two companies."""
    company_a = db.query(Company).filter(Company.id == req.company_a_id).first()
    company_b = db.query(Company).filter(Company.id == req.company_b_id).first()
    if not company_a or not company_b:
        raise HTTPException(404, "Company not found")

    provider = get_provider_from_db(db, current_user.id)

    prompt = f"""두 회사의 {req.merger_type} 시뮬레이션을 수행하세요.

회사 A: {company_a.name} ({company_a.industry})
비전: {company_a.vision or "미정"}
설명: {company_a.description or ""}

회사 B: {company_b.name} ({company_b.industry})
비전: {company_b.vision or "미정"}
설명: {company_b.description or ""}

{req.merger_type} 유형: {req.merger_type}

아래 JSON 형식으로 분석 결과를 작성하세요:
{{
  "synergies": ["시너지1", "시너지2", "시너지3"],
  "risks": ["리스크1", "리스크2", "리스크3"],
  "org_plan": "조직 통합 방안 (2-3문장)",
  "financial": {{
    "cost_saving": "예상 비용 절감액 (예: 연 50억원)",
    "revenue_gain": "예상 매출 증가 (예: 연 200억원)",
    "integration_cost": "통합 비용 (예: 30억원)"
  }},
  "timeline": "통합 완료 예상 기간 (예: 12-18개월)",
  "recommendation": "최종 권고 의견 (2-3문장)",
  "success_score": 0-100
}}

JSON만 출력하세요."""

    raw = provider.chat(
        [{"role": "user", "content": prompt}],
        system="당신은 M&A 전략 전문가입니다. JSON만 출력합니다.",
        session_type="general",
        max_tokens=1000,
    )

    default = {
        "synergies": [
            f"{company_a.name}·{company_b.name} 브랜드 시너지",
            "공동 고객 기반 확대",
            "기술·인프라 공유로 운영 효율화",
        ],
        "risks": [
            "조직 문화 충돌 위험",
            "핵심 인재 이탈 가능성",
            "통합 기간 중 고객 불안",
        ],
        "org_plan": f"{company_a.name}을 존속법인으로 하여 {company_b.name} 인력을 흡수합니다. 중복 기능은 6개월 내 통합하고 핵심 인재를 전략 역할에 재배치합니다.",
        "financial": {
            "cost_saving": "연 30억원",
            "revenue_gain": "연 150억원",
            "integration_cost": "20억원",
        },
        "timeline": "12-18개월",
        "recommendation": f"{req.merger_type}은 전략적으로 타당합니다. 초기 6개월 내 조직 통합을 완료하고 공동 브랜드 전략을 수립하면 시너지 극대화가 가능합니다.",
        "success_score": 72,
    }

    result = default
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
    except Exception:
        pass

    return {
        "company_a": {"id": company_a.id, "name": company_a.name, "industry": company_a.industry},
        "company_b": {"id": company_b.id, "name": company_b.name, "industry": company_b.industry},
        "merger_type": req.merger_type,
        "result": result,
    }


@router.get("/{sim_id}", response_model=SimulationOut)
def get_simulation(
    sim_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sim = db.query(SimulationRun).filter(SimulationRun.id == sim_id).first()
    if not sim:
        from fastapi import HTTPException
        raise HTTPException(404, "Simulation not found")
    return sim
