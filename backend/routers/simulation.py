import json
import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import SimulationRun, Company, User
from schemas.schemas import SimulationRequest, SimulationOut
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
