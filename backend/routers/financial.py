"""
계열사 재무제표 자동 생성 — 매출/비용/손익 데이터 입력 + AI 분석 + 환율 변환

GET    /api/financial                     — 재무제표 목록
POST   /api/financial                     — 재무 데이터 입력
GET    /api/financial/{id}                — 상세 조회
PATCH  /api/financial/{id}                — 수정
DELETE /api/financial/{id}                — 삭제
POST   /api/financial/{id}/analyze        — AI 경영 분석 리포트 생성
POST   /api/financial/company/{id}/report — 계열사 종합 재무 리포트
GET    /api/financial/company/{id}/summary — 계열사 재무 요약
GET    /api/financial/exchange-rates       — 실시간 환율 조회 (Frankfurter API)
POST   /api/financial/convert              — 금액 환율 변환
"""
import json
import logging
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.models import FinancialStatement, Company, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/financial", tags=["financial"])


@router.get("")
def list_statements(
    company_id: Optional[int] = None,
    statement_type: Optional[str] = None,
    period: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FinancialStatement)
    if company_id:
        q = q.filter(FinancialStatement.company_id == company_id)
    if statement_type:
        q = q.filter(FinancialStatement.statement_type == statement_type)
    if period:
        q = q.filter(FinancialStatement.period == period)
    rows = q.order_by(FinancialStatement.created_at.desc()).limit(limit).all()
    return [_fmt(s) for s in rows]


@router.post("")
def create_statement(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = body.get("company_id")
    if not company_id:
        raise HTTPException(400, "company_id 필수")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "계열사를 찾을 수 없습니다")

    fs = FinancialStatement(
        company_id=company_id,
        period=body.get("period", datetime.utcnow().strftime("%Y-Q1")),
        statement_type=body.get("statement_type", "income"),
        revenue=body.get("revenue", 0),
        cost_of_sales=body.get("cost_of_sales", 0),
        operating_expense=body.get("operating_expense", 0),
        operating_income=body.get("operating_income", 0),
        net_income=body.get("net_income", 0),
        total_assets=body.get("total_assets", 0),
        total_liabilities=body.get("total_liabilities", 0),
        total_equity=body.get("total_equity", 0),
        cash_flow=body.get("cash_flow", 0),
        raw_data=body.get("raw_data", {}),
        created_by=current_user.id,
    )
    # 자동 계산
    if fs.revenue and fs.cost_of_sales and not fs.operating_income:
        fs.operating_income = fs.revenue - fs.cost_of_sales - fs.operating_expense
    if fs.operating_income and not fs.net_income:
        fs.net_income = fs.operating_income * 0.75  # 간이 세율 가정

    db.add(fs)
    db.commit()
    db.refresh(fs)
    return _fmt(fs)


@router.get("/{fs_id}")
def get_statement(
    fs_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = db.query(FinancialStatement).filter(FinancialStatement.id == fs_id).first()
    if not fs:
        raise HTTPException(404, "재무제표를 찾을 수 없습니다")
    return _fmt(fs)


@router.patch("/{fs_id}")
def update_statement(
    fs_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = db.query(FinancialStatement).filter(FinancialStatement.id == fs_id).first()
    if not fs:
        raise HTTPException(404, "재무제표를 찾을 수 없습니다")
    for field in (
        "period", "statement_type", "revenue", "cost_of_sales",
        "operating_expense", "operating_income", "net_income",
        "total_assets", "total_liabilities", "total_equity",
        "cash_flow", "raw_data",
    ):
        if field in body:
            setattr(fs, field, body[field])
    fs.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(fs)
    return _fmt(fs)


@router.delete("/{fs_id}")
def delete_statement(
    fs_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = db.query(FinancialStatement).filter(FinancialStatement.id == fs_id).first()
    if fs:
        db.delete(fs)
        db.commit()
    return {"ok": True}


@router.post("/{fs_id}/analyze")
def analyze_statement(
    fs_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """개별 재무제표에 대한 AI 경영 분석 리포트 생성."""
    fs = db.query(FinancialStatement).filter(FinancialStatement.id == fs_id).first()
    if not fs:
        raise HTTPException(404, "재무제표를 찾을 수 없습니다")

    company = db.query(Company).filter(Company.id == fs.company_id).first()
    company_name = company.name if company else "Unknown"

    prompt = f"""다음은 '{company_name}' 계열사의 {fs.period} 재무 데이터입니다:

- 매출: {fs.revenue:,.0f}
- 매출원가: {fs.cost_of_sales:,.0f}
- 영업비용: {fs.operating_expense:,.0f}
- 영업이익: {fs.operating_income:,.0f}
- 순이익: {fs.net_income:,.0f}
- 총자산: {fs.total_assets:,.0f}
- 총부채: {fs.total_liabilities:,.0f}
- 자기자본: {fs.total_equity:,.0f}
- 현금흐름: {fs.cash_flow:,.0f}

위 데이터를 기반으로 아래 항목을 포함한 경영 분석 리포트를 작성하세요:
1. 수익성 분석 (매출총이익률, 영업이익률, 순이익률)
2. 안정성 분석 (부채비율, 자기자본비율)
3. 주요 이슈 및 리스크
4. 개선 제안 3가지
5. 종합 평가 (A~F 등급)

한국어로 작성하세요."""

    try:
        from services.ai_provider import get_provider_from_db
        provider = get_provider_from_db(db, current_user.id)
        messages = [{"role": "user", "content": prompt}]
        analysis = provider.chat(messages, system="당신은 기업 재무분석 전문 CFO입니다.", session_type="financial")
    except Exception as e:
        logger.warning("AI 재무 분석 실패: %s", e)
        analysis = _fallback_analysis(fs)

    fs.ai_analysis = analysis
    fs.updated_at = datetime.utcnow()
    db.commit()

    return {"id": fs.id, "analysis": analysis}


@router.post("/company/{company_id}/report")
def company_financial_report(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """계열사의 전체 재무 이력을 기반으로 종합 리포트를 생성합니다."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "계열사를 찾을 수 없습니다")

    statements = (
        db.query(FinancialStatement)
        .filter(FinancialStatement.company_id == company_id)
        .order_by(FinancialStatement.period.asc())
        .all()
    )

    if not statements:
        return {
            "company": company.name,
            "report": "재무 데이터가 없습니다. 먼저 재무제표를 입력하세요.",
            "periods": [],
        }

    # 재무 데이터 요약
    periods_data = []
    for s in statements:
        periods_data.append({
            "period": s.period,
            "revenue": s.revenue,
            "operating_income": s.operating_income,
            "net_income": s.net_income,
            "total_assets": s.total_assets,
        })

    data_text = "\n".join(
        f"- {d['period']}: 매출 {d['revenue']:,.0f}, 영업이익 {d['operating_income']:,.0f}, 순이익 {d['net_income']:,.0f}"
        for d in periods_data
    )

    prompt = f"""'{company.name}' ({company.industry}) 계열사의 기간별 재무 데이터:

{data_text}

위 데이터를 기반으로 다음을 포함하는 종합 재무 리포트를 작성하세요:
1. 매출 및 수익성 추이 분석
2. 성장률 분석 (전기 대비)
3. 재무 건전성 평가
4. 향후 전망 및 리스크
5. 경영진 추천 사항

JSON 형식으로 반환하세요:
{{"summary": "종합 요약 2-3문장", "growth_analysis": "성장 분석", "profitability": "수익성 분석", "risk_factors": ["리스크1", "리스크2"], "recommendations": ["추천1", "추천2", "추천3"], "grade": "A~F 등급"}}"""

    try:
        from services.ai_provider import get_provider_from_db
        provider = get_provider_from_db(db, current_user.id)
        messages = [{"role": "user", "content": prompt}]
        raw = provider.chat(messages, system="당신은 기업 재무분석 전문 CFO입니다.", session_type="financial")

        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            report = json.loads(m.group())
        else:
            report = {"summary": raw[:500], "grade": "N/A"}
    except Exception as e:
        logger.warning("종합 재무 리포트 실패: %s", e)
        report = {
            "summary": f"{company.name}의 재무 데이터 {len(statements)}건 기반 분석입니다.",
            "grade": "N/A",
            "recommendations": ["AI 분석 서비스 연결을 확인하세요."],
        }

    return {
        "company": company.name,
        "report": report,
        "periods": periods_data,
        "total_statements": len(statements),
    }


@router.get("/company/{company_id}/summary")
def company_summary(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """계열사 재무 요약 (최근 기간 기준)."""
    latest = (
        db.query(FinancialStatement)
        .filter(FinancialStatement.company_id == company_id)
        .order_by(FinancialStatement.period.desc())
        .first()
    )
    if not latest:
        return {"has_data": False}

    total = db.query(FinancialStatement).filter(
        FinancialStatement.company_id == company_id
    ).count()

    return {
        "has_data": True,
        "latest_period": latest.period,
        "revenue": latest.revenue,
        "operating_income": latest.operating_income,
        "net_income": latest.net_income,
        "total_assets": latest.total_assets,
        "total_equity": latest.total_equity,
        "margin": round(latest.operating_income / latest.revenue * 100, 1) if latest.revenue else 0,
        "total_periods": total,
    }


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────
def _fmt(fs: FinancialStatement) -> dict:
    return {
        "id": fs.id,
        "company_id": fs.company_id,
        "period": fs.period,
        "statement_type": fs.statement_type,
        "revenue": fs.revenue,
        "cost_of_sales": fs.cost_of_sales,
        "operating_expense": fs.operating_expense,
        "operating_income": fs.operating_income,
        "net_income": fs.net_income,
        "total_assets": fs.total_assets,
        "total_liabilities": fs.total_liabilities,
        "total_equity": fs.total_equity,
        "cash_flow": fs.cash_flow,
        "raw_data": fs.raw_data,
        "ai_analysis": fs.ai_analysis,
        "created_at": fs.created_at.isoformat() if fs.created_at else None,
        "updated_at": fs.updated_at.isoformat() if fs.updated_at else None,
    }


# ── 환율 API (Frankfurter) ──────────────────────────────────────────────────

@router.get("/exchange-rates")
def get_exchange_rates(
    base: str = "KRW",
    symbols: Optional[str] = "USD,EUR,JPY,CNY,GBP",
    _: User = Depends(get_current_user),
):
    """
    실시간 환율 조회 (Frankfurter API).
    base: 기준 통화 (기본 KRW)
    symbols: 대상 통화 (쉼표 구분)
    10분 캐시 적용.
    """
    from core.cache import cache_get, cache_set
    import httpx

    cache_key = f"fx:{base}:{symbols}"
    cached = cache_get(cache_key)
    if cached is not None:
        cached["_cached"] = True
        return cached

    try:
        url = f"https://api.frankfurter.dev/v1/latest?base={base}"
        if symbols:
            url += f"&symbols={symbols}"
        r = httpx.get(url, timeout=5.0)
        r.raise_for_status()
        data = r.json()
        result = {
            "base": data.get("base", base),
            "date": data.get("date"),
            "rates": data.get("rates", {}),
        }
        cache_set(cache_key, result, ttl=600)
        return result
    except Exception as e:
        logger.warning("환율 조회 실패: %s", e)
        # 폴백: 고정 환율 (대략적)
        fallback_rates = {
            "USD": 0.00074, "EUR": 0.00068, "JPY": 0.11,
            "CNY": 0.0053, "GBP": 0.00059,
        }
        if base != "KRW":
            fallback_rates = {"KRW": 1350.0, "USD": 1.0, "EUR": 0.92, "JPY": 149.5}
        return {
            "base": base,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "rates": fallback_rates,
            "_fallback": True,
        }


@router.get("/exchange-history")
def get_exchange_history(
    base: str = "KRW",
    symbols: str = "USD",
    days: int = 30,
    _: User = Depends(get_current_user),
):
    """환율 변동 이력 (Frankfurter time series)."""
    from core.cache import cache_get, cache_set
    import httpx
    from datetime import timedelta

    cache_key = f"fx_history:{base}:{symbols}:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    end_date = datetime.utcnow().strftime("%Y-%m-%d")
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

    try:
        url = f"https://api.frankfurter.dev/v1/{start_date}..{end_date}?base={base}&symbols={symbols}"
        r = httpx.get(url, timeout=10.0)
        r.raise_for_status()
        data = r.json()
        result = {
            "base": data.get("base", base),
            "start_date": data.get("start_date", start_date),
            "end_date": data.get("end_date", end_date),
            "rates": data.get("rates", {}),
        }
        cache_set(cache_key, result, ttl=1800)  # 30분 캐시
        return result
    except Exception as e:
        logger.warning("환율 이력 조회 실패: %s", e)
        return {
            "base": base,
            "start_date": start_date,
            "end_date": end_date,
            "rates": {},
            "_fallback": True,
        }


@router.post("/convert")
def convert_currency(
    body: dict,
    _: User = Depends(get_current_user),
):
    """
    금액 환율 변환.
    body: { "amount": 1000000, "from": "KRW", "to": "USD" }
    """
    import httpx
    from core.cache import cache_get, cache_set

    amount = body.get("amount", 0)
    from_cur = body.get("from", "KRW")
    to_cur = body.get("to", "USD")

    if not amount:
        return {"amount": 0, "from": from_cur, "to": to_cur, "result": 0}

    cache_key = f"fx_convert:{from_cur}:{to_cur}"
    rate = cache_get(cache_key)

    if rate is None:
        try:
            url = f"https://api.frankfurter.dev/v1/latest?base={from_cur}&symbols={to_cur}"
            r = httpx.get(url, timeout=5.0)
            r.raise_for_status()
            rates = r.json().get("rates", {})
            rate = rates.get(to_cur)
            if rate:
                cache_set(cache_key, rate, ttl=600)
        except Exception as e:
            logger.warning("환율 변환 실패: %s", e)
            rate = None

    if rate is None:
        return {"amount": amount, "from": from_cur, "to": to_cur, "result": None, "error": "환율 정보를 가져올 수 없습니다."}

    result = round(amount * rate, 2)
    return {
        "amount": amount,
        "from": from_cur,
        "to": to_cur,
        "rate": rate,
        "result": result,
    }


def _fallback_analysis(fs: FinancialStatement) -> str:
    """AI 없이 기본 분석."""
    margin = round(fs.operating_income / fs.revenue * 100, 1) if fs.revenue else 0
    debt_ratio = round(fs.total_liabilities / fs.total_equity * 100, 1) if fs.total_equity else 0
    return f"""## 재무 분석 요약 ({fs.period})

### 수익성
- 영업이익률: {margin}%
- 순이익: {fs.net_income:,.0f}

### 안정성
- 부채비율: {debt_ratio}%
- 자기자본: {fs.total_equity:,.0f}

### 평가
{'수익성 양호' if margin > 10 else '수익성 개선 필요'}
{'재무 안정적' if debt_ratio < 200 else '부채 관리 필요'}

*AI 분석 서비스 미연결 — 간이 분석 결과입니다.*"""
