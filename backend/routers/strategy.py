from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import StrategyItem, CEOPerformance, Collaboration, User, Company
from schemas.schemas import (
    StrategyItemCreate, StrategyItemUpdate, StrategyItemOut,
    CEOEvaluateRequest, CEOPerformanceOut,
    CollaborationCreate, CollaborationOut,
)
from services.ai_provider import get_provider_from_db

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


# ── Strategy Map ──────────────────────────────────────────────────────────────
@router.get("/map", response_model=List[StrategyItemOut])
def strategy_map(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(StrategyItem)
    if company_id is not None:
        q = q.filter(StrategyItem.company_id == company_id)
    return q.order_by(StrategyItem.created_at).all()


@router.post("/map", response_model=StrategyItemOut)
def create_strategy_item(
    item_in: StrategyItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = StrategyItem(**item_in.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/map/{item_id}", response_model=StrategyItemOut)
def update_strategy_item(
    item_id: int,
    update: StrategyItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(StrategyItem).filter(StrategyItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/map/{item_id}")
def delete_strategy_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(StrategyItem).filter(StrategyItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── CEO Performance ───────────────────────────────────────────────────────────
@router.post("/ceo/evaluate", response_model=CEOPerformanceOut)
def evaluate_ceo(
    req: CEOEvaluateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    provider = get_provider_from_db(db, current_user.id)
    prompt = f"""회사 "{company.name}" ({company.industry})의 AI CEO 성과를 평가하세요.
기간: {req.period}
회사 비전: {company.vision}

JSON 형식으로 평가:
{{
  "overall_score": 0.0-10.0,
  "metrics": {{"전략 실행": 8.5, "팀 관리": 7.0, "시장 성과": 6.5, "혁신": 8.0}},
  "strengths": ["강점1", "강점2"],
  "improvements": ["개선점1", "개선점2"],
  "notes": "종합 평가 의견"
}}"""

    import json
    messages = [{"role": "user", "content": prompt}]
    raw = provider.chat(messages, system="당신은 경영 평가 전문가입니다.", session_type="general")

    default = {
        "overall_score": 7.5,
        "metrics": {"전략 실행": 7.5, "팀 관리": 7.0, "시장 성과": 7.5, "혁신": 8.0},
        "strengths": ["데이터 기반 의사결정", "빠른 실행력"],
        "improvements": ["장기 전략 수립 강화", "팀 소통 개선"],
        "notes": f"{company.name} CEO의 {req.period} 성과를 종합 분석한 결과입니다.",
    }

    result = default
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
    except Exception:
        pass

    perf = CEOPerformance(
        company_id=req.company_id,
        period=req.period,
        overall_score=result.get("overall_score", 7.5),
        metrics=result.get("metrics", {}),
        strengths=result.get("strengths", []),
        improvements=result.get("improvements", []),
        notes=result.get("notes", ""),
    )
    db.add(perf)
    db.commit()
    db.refresh(perf)
    return perf


@router.get("/ceo/performance", response_model=List[CEOPerformanceOut])
def list_ceo_performance(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(CEOPerformance)
    if company_id:
        q = q.filter(CEOPerformance.company_id == company_id)
    return q.order_by(CEOPerformance.created_at.desc()).all()


@router.get("/ceo/leaderboard")
def ceo_leaderboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    performances = (
        db.query(CEOPerformance)
        .order_by(CEOPerformance.overall_score.desc())
        .limit(10)
        .all()
    )
    result = []
    for p in performances:
        company = db.query(Company).filter(Company.id == p.company_id).first()
        result.append({
            "company_id": p.company_id,
            "company_name": company.name if company else "Unknown",
            "period": p.period,
            "overall_score": p.overall_score,
        })
    return result


# ── Collaborations ────────────────────────────────────────────────────────────
@router.get("/collaborations", response_model=List[CollaborationOut])
def list_collaborations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Collaboration).order_by(Collaboration.created_at.desc()).all()


@router.post("/collaborations", response_model=CollaborationOut)
def create_collaboration(
    collab_in: CollaborationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    collab = Collaboration(**collab_in.model_dump())
    db.add(collab)
    db.commit()
    db.refresh(collab)
    return collab
