"""
그룹 주간 브리핑 자동 생성 라우터
수집 데이터 + 전략 현황 + KPI를 종합하여 AI가 경영진용 주간 브리핑을 생성합니다.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from core.database import get_db
from core.security import get_current_user
from models.models import CollectedData, StrategyItem, KpiDataLink, Company, User

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


@router.post("/generate", summary="그룹 주간 브리핑 자동 생성")
def generate_briefing(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """수집 데이터 + 전략 현황 + KPI를 종합하여 AI 경영진 주간 브리핑을 생성합니다."""
    from services.ai_provider import get_provider_from_db

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    # ── 수집 데이터 요약 ────────────────────────────────────────────────────────
    recent_data = (
        db.query(CollectedData)
        .filter(CollectedData.created_at >= week_ago)
        .order_by(CollectedData.created_at.desc())
        .limit(20)
        .all()
    )
    data_summary = "\n".join(
        f"- [{d.data_type}] {d.title}: {(d.content or '')[:150]}"
        for d in recent_data
    ) or "(수집 데이터 없음)"

    # ── 전략 현황 ────────────────────────────────────────────────────────────────
    active_items = (
        db.query(StrategyItem)
        .filter(StrategyItem.status == "active")
        .order_by(StrategyItem.created_at.desc())
        .limit(15)
        .all()
    )
    strategy_summary = "\n".join(
        f"- [{item.item_type}] {item.title} (진척도 {item.progress}%, 우선순위 {item.priority})"
        for item in active_items
    ) or "(진행 중인 전략 없음)"

    # ── KPI 현황 ─────────────────────────────────────────────────────────────────
    kpi_links = db.query(KpiDataLink).filter(KpiDataLink.is_active == True).limit(10).all()
    kpi_summary = ""
    if kpi_links:
        kpi_lines = []
        for lnk in kpi_links:
            item = db.query(StrategyItem).filter(StrategyItem.id == lnk.strategy_item_id).first()
            if item and lnk.last_value is not None:
                kpi_lines.append(
                    f"- {item.title}: {lnk.last_value:.3f} {lnk.unit} ({lnk.source}/{lnk.series_id})"
                )
        kpi_summary = "\n".join(kpi_lines) or "(KPI 데이터 없음)"
    else:
        kpi_summary = "(연결된 KPI 없음)"

    # ── 계열사 수 ─────────────────────────────────────────────────────────────────
    companies = db.query(Company).filter(Company.is_competitor == False, Company.status == "active").all()
    company_names = ", ".join(c.name for c in companies[:8]) or "등록된 계열사 없음"

    prompt = f"""다음 데이터를 바탕으로 한 그룹의 주간 경영진 브리핑을 작성하세요.
기간: {week_ago.strftime('%Y-%m-%d')} ~ {now.strftime('%Y-%m-%d')}
계열사: {company_names}

## 이번 주 수집 데이터 ({len(recent_data)}건)
{data_summary}

## 진행 중인 전략 ({len(active_items)}개)
{strategy_summary}

## KPI 현황
{kpi_summary}

다음 형식으로 브리핑을 작성하세요:
# 주간 경영 브리핑 — {now.strftime('%Y년 %m월 %d일')}

## 핵심 요약 (3줄)
## 주요 시장 동향
## 전략 진척 현황
## KPI 주요 변동
## 주의 사항 / 리스크
## 이번 주 권고 사항 (3가지)"""

    provider = get_provider_from_db(db, current_user.id)
    briefing_text = provider.chat(
        messages=[{"role": "user", "content": prompt}],
        system="당신은 그룹 회장을 보좌하는 AI 경영 분석가입니다. 간결하고 실무적인 브리핑을 작성합니다.",
        max_tokens=1500,
    )

    return {
        "briefing": briefing_text,
        "generated_at": now.isoformat(),
        "period_start": week_ago.isoformat(),
        "period_end": now.isoformat(),
        "data_count": len(recent_data),
        "strategy_count": len(active_items),
        "kpi_count": len(kpi_links),
        "company_names": company_names,
    }
