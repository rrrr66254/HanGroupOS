"""그룹 KPI 스코어보드 API — 계열사별 KPI 랭킹 + 게이미피케이션."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from core.database import get_db
from models.models import CompanyKpi, Company, AiAgentMetrics
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/kpi-scoreboard", tags=["kpi-scoreboard"])


class KpiUpdate(BaseModel):
    company_id: int
    metric_name: str
    metric_label: str = ""
    value: float
    target: float = 100.0
    unit: str = ""


@router.get("/ranking")
def get_ranking(db: Session = Depends(get_db)):
    """계열사별 종합 점수 랭킹."""
    companies = db.query(Company).filter(Company.status == "active").all()
    rankings = []

    for c in companies:
        kpis = db.query(CompanyKpi).filter(CompanyKpi.company_id == c.id).all()

        # AI 메트릭 기반 자동 KPI 계산
        since = datetime.utcnow() - timedelta(days=30)
        metrics = db.query(AiAgentMetrics).filter(
            AiAgentMetrics.company_id == c.id,
            AiAgentMetrics.created_at >= since,
        ).all()

        ai_usage = len(metrics)
        avg_quality = 0.0
        avg_speed = 0.0
        if metrics:
            scored = [m for m in metrics if m.quality_score is not None]
            avg_quality = sum(m.quality_score for m in scored) / len(scored) if scored else 0
            avg_speed = sum(m.response_time_ms for m in metrics) / len(metrics)

        # KPI 달성률 계산
        kpi_scores = []
        for k in kpis:
            if k.target > 0:
                kpi_scores.append(min(k.value / k.target, 1.5))  # 최대 150%

        # 종합 점수 (0~100)
        manual_score = (sum(kpi_scores) / len(kpi_scores) * 40) if kpi_scores else 0
        ai_score = min(ai_usage / 10, 20)  # AI 활용도 최대 20점
        quality_score = avg_quality * 25  # 품질 최대 25점
        speed_score = max(0, 15 - (avg_speed / 2000))  # 속도 최대 15점

        total = round(manual_score + ai_score + quality_score + speed_score, 1)

        # 트로피 결정
        if total >= 80:
            trophy = "gold"
        elif total >= 60:
            trophy = "silver"
        elif total >= 40:
            trophy = "bronze"
        else:
            trophy = None

        rankings.append({
            "company_id": c.id,
            "company_name": c.name,
            "industry": c.industry,
            "total_score": total,
            "trophy": trophy,
            "breakdown": {
                "kpi_achievement": round(manual_score, 1),
                "ai_usage": round(ai_score, 1),
                "ai_quality": round(quality_score, 1),
                "response_speed": round(speed_score, 1),
            },
            "ai_calls_30d": ai_usage,
            "avg_quality": round(avg_quality, 3),
            "kpi_count": len(kpis),
        })

    rankings.sort(key=lambda x: x["total_score"], reverse=True)
    # 순위 부여
    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    return {"rankings": rankings, "total_companies": len(rankings)}


@router.get("/company/{company_id}")
def get_company_kpis(company_id: int, db: Session = Depends(get_db)):
    """특정 계열사의 KPI 목록."""
    kpis = db.query(CompanyKpi).filter(CompanyKpi.company_id == company_id).all()
    return [
        {
            "id": k.id,
            "metric_name": k.metric_name,
            "metric_label": k.metric_label,
            "value": k.value,
            "target": k.target,
            "unit": k.unit,
            "period": k.period,
            "achievement": round(k.value / k.target * 100, 1) if k.target > 0 else 0,
            "updated_at": k.updated_at.isoformat() if k.updated_at else None,
        }
        for k in kpis
    ]


@router.post("/kpi")
def upsert_kpi(req: KpiUpdate, db: Session = Depends(get_db)):
    """KPI 생성 또는 업데이트."""
    existing = db.query(CompanyKpi).filter(
        CompanyKpi.company_id == req.company_id,
        CompanyKpi.metric_name == req.metric_name,
    ).first()

    if existing:
        existing.value = req.value
        existing.target = req.target
        existing.metric_label = req.metric_label or existing.metric_label
        existing.unit = req.unit or existing.unit
    else:
        existing = CompanyKpi(
            company_id=req.company_id,
            metric_name=req.metric_name,
            metric_label=req.metric_label or req.metric_name,
            value=req.value,
            target=req.target,
            unit=req.unit,
        )
        db.add(existing)

    db.commit()
    return {"status": "ok", "id": existing.id}
