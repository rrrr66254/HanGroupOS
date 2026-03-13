from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import Company, OrgNode, User
from schemas.schemas import CompanyCreate, CompanyUpdate, CompanyOut
from services.org_service import create_company_org, get_company_org_tree

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("", response_model=List[CompanyOut])
def list_companies(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Company)
    if status:
        q = q.filter(Company.status == status)
    return q.order_by(Company.created_at.desc()).offset(offset).limit(min(limit, 500)).all()


@router.post("", response_model=CompanyOut)
def create_company(
    company_in: CompanyCreate,
    auto_org: bool = True,
    ai_budget: str = "any",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = Company(
        name=company_in.name,
        description=company_in.description,
        industry=company_in.industry,
        vision=company_in.vision,
        status=company_in.status,
        created_by=current_user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    if auto_org:
        create_company_org(db, company.id, company_in.industry or "general", ai_budget)

    return company


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    return company


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: int,
    update: CompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    db.delete(company)
    db.commit()
    return {"ok": True}


@router.get("/{company_id}/org-tree")
def get_company_org(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tree = get_company_org_tree(db, company_id)
    return {"tree": tree}


@router.get("/health-scores", summary="계열사별 건강 스코어카드")
def health_scores(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """KPI 충족률 + 전략 진척도 + 수집 데이터 활동을 종합한 계열사별 건강 점수를 반환합니다."""
    from datetime import timedelta, datetime as dt
    from sqlalchemy import func
    from models.models import StrategyItem, KpiDataLink, CollectedData

    companies = db.query(Company).filter(
        Company.is_competitor == False,
        Company.status == "active",
    ).all()

    week_ago = dt.utcnow() - timedelta(days=7)
    results = []

    for comp in companies:
        # ① 전략 진척도 평균
        items = db.query(StrategyItem).filter(
            StrategyItem.company_id == comp.id,
            StrategyItem.status == "active",
        ).all()
        avg_progress = (sum(i.progress for i in items) / len(items)) if items else 0

        # ② KPI 충족률 (last_value가 있는 링크 비율)
        kpi_links = db.query(KpiDataLink).filter(
            KpiDataLink.strategy_item_id.in_([i.id for i in items]),
            KpiDataLink.is_active == True,
        ).all() if items else []
        kpi_filled = sum(1 for lnk in kpi_links if lnk.last_value is not None)
        kpi_rate = (kpi_filled / len(kpi_links) * 100) if kpi_links else 0

        # ③ 최근 7일 데이터 수집 건수
        recent_data = db.query(func.count(CollectedData.id)).filter(
            CollectedData.company_id == comp.id,
            CollectedData.created_at >= week_ago,
        ).scalar() or 0
        data_score = min(recent_data * 10, 100)  # 10건당 100점 만점

        # 종합 점수
        score = int(avg_progress * 0.5 + kpi_rate * 0.3 + data_score * 0.2)
        health = "good" if score >= 70 else "warning" if score >= 40 else "critical"

        results.append({
            "id": comp.id,
            "name": comp.name,
            "industry": comp.industry,
            "score": score,
            "health": health,
            "avg_progress": round(avg_progress, 1),
            "kpi_rate": round(kpi_rate, 1),
            "recent_data": recent_data,
            "strategy_count": len(items),
            "kpi_count": len(kpi_links),
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"companies": results, "generated_at": dt.utcnow().isoformat()}
