"""
AI 문서 자동 생성기
기존 DB 데이터(전략 아이템, 수집 데이터, CEO 실적, 역량)를 활용해
원클릭으로 사업계획서·시장 분석 브리핑·IR 보고서 생성
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import (
    Company, CollectedData, StrategyItem, CEOPerformance,
    CompanyCapability, MarketReport, User,
)
from services.ai_provider import get_provider_from_db, MARKET_ANALYST_SYSTEM
from services.ir_service import generate_ir_report

router = APIRouter(prefix="/api/docs", tags=["docs"])

DOC_TYPES = [
    {
        "id": "ir",
        "name": "IR 보고서",
        "description": "투자자용 회사 소개 및 실적 보고서 (HTML 슬라이드)",
        "icon": "📊",
        "format": "html",
        "color": "brand",
    },
    {
        "id": "business_plan",
        "name": "사업계획서",
        "description": "전략 아이템·역량·수집 데이터 기반 사업계획서 (Markdown)",
        "icon": "📋",
        "format": "markdown",
        "color": "success",
    },
    {
        "id": "market_brief",
        "name": "시장 분석 브리핑",
        "description": "최근 수집 데이터로 시장 동향·기회·위협 요약 (Markdown)",
        "icon": "📈",
        "format": "markdown",
        "color": "accent",
    },
    {
        "id": "weekly_report",
        "name": "주간 업무 보고",
        "description": "업무 로그 기반 주간 성과 보고서 (AI 생성, Markdown)",
        "icon": "📅",
        "format": "markdown",
        "color": "amber",
    },
]


@router.get("/types", summary="지원 문서 타입 목록")
def get_doc_types():
    return {"types": DOC_TYPES}


@router.get("/ir/{company_id}", response_class=HTMLResponse, summary="IR 보고서 생성")
def get_ir_report(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기존 ir_service를 활용해 HTML IR 보고서 생성 및 반환."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "회사를 찾을 수 없습니다.")

    html = generate_ir_report(db, company_id, current_user.id)
    if not html:
        raise HTTPException(500, "IR 보고서 생성에 실패했습니다.")
    return HTMLResponse(content=html)


@router.post("/business-plan/{company_id}", summary="사업계획서 생성 (Markdown)")
def generate_business_plan(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    전략 아이템·회사 역량·수집 데이터·CEO 실적을 종합해
    AI로 사업계획서를 Markdown 형식으로 생성합니다.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "회사를 찾을 수 없습니다.")

    # ── 데이터 수집 ────────────────────────────────────────────────────────────
    strategies = (
        db.query(StrategyItem)
        .filter(StrategyItem.company_id == company_id, StrategyItem.status == "active")
        .order_by(StrategyItem.priority.desc())
        .limit(10)
        .all()
    )

    capabilities = (
        db.query(CompanyCapability)
        .filter(CompanyCapability.company_id == company_id, CompanyCapability.status == "active")
        .limit(10)
        .all()
    )

    collected = (
        db.query(CollectedData)
        .filter(CollectedData.company_id == company_id)
        .order_by(CollectedData.created_at.desc())
        .limit(15)
        .all()
    )

    ceo_perf = (
        db.query(CEOPerformance)
        .filter(CEOPerformance.company_id == company_id)
        .order_by(CEOPerformance.created_at.desc())
        .first()
    )

    market_reports = (
        db.query(MarketReport)
        .filter(MarketReport.company_id == company_id)
        .order_by(MarketReport.created_at.desc())
        .limit(3)
        .all()
    )

    # ── 프롬프트 구성 ──────────────────────────────────────────────────────────
    strategy_text = "\n".join(
        f"- [{s.item_type}] {s.title}: {s.description}" for s in strategies
    ) or "전략 아이템 없음"

    capability_text = "\n".join(
        f"- {c.capability_name}: {c.description}" for c in capabilities
    ) or "역량 정보 없음"

    data_text = "\n".join(
        f"[{d.data_type}] {d.title}: {d.content[:200]}" for d in collected
    ) or "수집 데이터 없음"

    perf_text = ""
    if ceo_perf:
        perf_text = (
            f"종합 점수: {ceo_perf.overall_score:.1f}/10\n"
            f"평가: {ceo_perf.summary or ''}"
        )

    market_text = "\n".join(
        f"- {r.title}: {r.summary}" for r in market_reports
    ) or ""

    prompt = f"""다음은 {company.name} ({company.industry or '업종 미정'})의 현재 경영 데이터입니다.
이 데이터를 바탕으로 전문적인 사업계획서를 Markdown 형식으로 작성해주세요.

## 회사 정보
- 회사명: {company.name}
- 업종: {company.industry or '미정'}
- 설명: {company.description or '없음'}

## 현재 전략 아이템
{strategy_text}

## 보유 역량
{capability_text}

## 최근 시장/업계 데이터 ({len(collected)}건)
{data_text}

## CEO 실적 평가
{perf_text or '평가 없음'}

## 시장 분석 보고서 요약
{market_text or '없음'}

---
다음 구성으로 사업계획서를 작성해주세요:
1. 회사 개요 및 비전
2. 시장 기회 분석
3. 핵심 전략 (3~5가지)
4. 보유 역량 및 경쟁 우위
5. 실행 로드맵 (6~12개월)
6. 예상 성과 지표 (KPI)
7. 투자 포인트 (선택)

구체적인 수치와 근거를 포함하고, 한국어로 작성해주세요."""

    provider = get_provider_from_db(db, current_user.id)
    content = provider.chat(
        [{"role": "user", "content": prompt}],
        system=MARKET_ANALYST_SYSTEM,
        session_type="general",
    )

    return {
        "type": "business_plan",
        "company_id": company_id,
        "company_name": company.name,
        "format": "markdown",
        "content": content,
        "data_sources": {
            "strategies": len(strategies),
            "capabilities": len(capabilities),
            "collected_data": len(collected),
            "has_ceo_performance": ceo_perf is not None,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.post("/market-brief/{company_id}", summary="시장 분석 브리핑 생성 (Markdown)")
def generate_market_brief(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    최근 수집 데이터 + MarketReport를 종합해
    시장 동향·기회·위협·전략적 함의를 Markdown으로 생성합니다.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "회사를 찾을 수 없습니다.")

    collected = (
        db.query(CollectedData)
        .filter(CollectedData.company_id == company_id)
        .order_by(CollectedData.created_at.desc())
        .limit(25)
        .all()
    )

    market_reports = (
        db.query(MarketReport)
        .filter(MarketReport.company_id == company_id)
        .order_by(MarketReport.created_at.desc())
        .limit(5)
        .all()
    )

    if not collected and not market_reports:
        raise HTTPException(404, "분석할 데이터가 없습니다. 먼저 시장 데이터를 수집하세요.")

    data_text = "\n".join(
        f"[{d.data_type}/{d.source}] {d.title}\n{d.content[:300]}"
        for d in collected
    )

    report_text = "\n".join(
        f"## {r.title}\n{r.summary}" for r in market_reports
    )

    prompt = f"""다음은 {company.name}의 최근 수집된 시장·업계 데이터입니다.

## 수집 데이터 ({len(collected)}건)
{data_text or '없음'}

## 기존 시장 분석 보고서 ({len(market_reports)}건)
{report_text or '없음'}

---
위 데이터를 바탕으로 {company.name} ({company.industry or '해당 업종'})을 위한 시장 분석 브리핑을 작성해주세요.
다음 항목을 포함해 주세요:

1. **핵심 시장 동향** (3~5가지, 수치 포함)
2. **기회 요인** (2~3가지)
3. **위협·리스크** (2~3가지)
4. **경쟁 환경** 요약
5. **전략적 함의** (당사가 취해야 할 액션)
6. **즉각 실행 가능한 추천 사항** (3가지)

한국어로 작성하고, 구체적 수치와 사례를 포함해주세요."""

    provider = get_provider_from_db(db, current_user.id)
    content = provider.chat(
        [{"role": "user", "content": prompt}],
        system=MARKET_ANALYST_SYSTEM,
        session_type="general",
    )

    return {
        "type": "market_brief",
        "company_id": company_id,
        "company_name": company.name,
        "format": "markdown",
        "content": content,
        "data_sources": {
            "collected_data": len(collected),
            "market_reports": len(market_reports),
        },
        "generated_at": datetime.utcnow().isoformat(),
    }
