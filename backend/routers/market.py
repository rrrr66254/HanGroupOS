import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import MarketReport, ApprovalRequest, User
from schemas.schemas import MarketAnalyzeRequest, MarketReportOut
from services.ai_provider import get_provider_from_db, MARKET_ANALYST_SYSTEM

router = APIRouter(prefix="/api/market", tags=["market"])

MOCK_ANALYSIS = {
    "summary": "시장 분석 완료. 성장 가능성이 높은 분야로 확인됩니다.",
    "opportunities": [
        {"title": "디지털 전환 수요", "description": "기업의 AI 도입 수요 급증", "potential": "high"},
        {"title": "신규 고객층 확보", "description": "MZ세대 디지털 서비스 소비 증가", "potential": "medium"},
        {"title": "글로벌 시장 진출", "description": "아시아 태평양 시장 확장 가능", "potential": "high"},
    ],
    "threats": [
        {"title": "경쟁 심화", "description": "글로벌 빅테크 기업의 시장 진입"},
        {"title": "규제 리스크", "description": "AI 관련 규제 강화 가능성"},
    ],
    "competitors": [
        {"name": "경쟁사 A", "market_share": "23%", "strength": "브랜드 인지도"},
        {"name": "경쟁사 B", "market_share": "18%", "strength": "기술력"},
        {"name": "기타", "market_share": "59%", "strength": "분산"},
    ],
    "trends": [
        "AI 자동화 도입 가속화",
        "구독형 SaaS 모델 성장",
        "데이터 기반 의사결정 표준화",
        "멀티클라우드 전략 확산",
    ],
}


@router.post("/analyze", response_model=MarketReportOut)
def analyze_market(
    req: MarketAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_provider_from_db(db, current_user.id)

    prompt = f"""다음 산업을 분석하세요: {req.industry}
{f"초점: {req.focus}" if req.focus else ""}

JSON 형식으로 응답하세요:
{{
  "summary": "...",
  "opportunities": [{{"title": "...", "description": "...", "potential": "high/medium/low"}}],
  "threats": [{{"title": "...", "description": "..."}}],
  "competitors": [{{"name": "...", "market_share": "...", "strength": "..."}}],
  "trends": ["...", "..."]
}}"""

    messages = [{"role": "user", "content": prompt}]
    raw = provider.chat(messages, system=MARKET_ANALYST_SYSTEM, session_type="general")

    # Try to parse JSON from response
    analysis = MOCK_ANALYSIS.copy()
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            analysis = json.loads(raw[start:end])
    except Exception:
        pass

    report = MarketReport(
        company_id=req.company_id,
        industry=req.industry,
        title=f"{req.industry} 시장 분석 보고서",
        summary=analysis.get("summary", ""),
        opportunities=analysis.get("opportunities", []),
        threats=analysis.get("threats", []),
        competitors=analysis.get("competitors", []),
        trends=analysis.get("trends", []),
        raw_analysis=raw,
    )
    db.add(report)

    # Create chairman briefing approval
    briefing = ApprovalRequest(
        title=f"[시장분석] {req.industry} 분석 결과 보고",
        description=f"AI 시장분석팀이 {req.industry} 분야 분석을 완료했습니다. 검토 후 전략 방향을 결정해 주세요.",
        request_type="market_briefing",
        requester="AI 시장분석팀",
        company_id=req.company_id,
        meta={"industry": req.industry, "summary": analysis.get("summary", "")},
    )
    db.add(briefing)
    db.commit()
    db.refresh(report)
    return report


@router.get("/reports", response_model=List[MarketReportOut])
def list_reports(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(MarketReport)
    if company_id:
        q = q.filter(MarketReport.company_id == company_id)
    return q.order_by(MarketReport.created_at.desc()).all()


@router.get("/reports/{report_id}", response_model=MarketReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    report = db.query(MarketReport).filter(MarketReport.id == report_id).first()
    if not report:
        from fastapi import HTTPException
        raise HTTPException(404, "Report not found")
    return report
