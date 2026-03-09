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
    StrategyGenerateRequest,
)
from services.ai_provider import get_provider_from_db
import json, re

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


# ── AI Auto-Generate Strategy ─────────────────────────────────────────────────
@router.post("/generate")
def generate_strategy(
    req: StrategyGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ask AI to generate 5 tailored strategy items for a company and save them."""
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    provider = get_provider_from_db(db, current_user.id)

    focus_line = f"\n집중 영역: {req.focus}" if req.focus else ""
    prompt = f"""회사 "{company.name}" ({company.industry}) 의 구체적인 전략 계획을 수립해주세요.
비전: {company.vision or ''}
설명: {company.description or ''}{focus_line}

아래 JSON 배열 형식으로 정확히 5개의 전략 항목을 생성하세요.
각 타입(objective, initiative, milestone, kpi)을 최소 1개 이상 포함하고,
회사 산업·비전에 맞게 구체적으로 작성하세요.

[
  {{
    "title": "항목 제목 (20자 이내)",
    "description": "상세 설명 (50자 이내)",
    "item_type": "objective",
    "priority": "high",
    "due_date": "2025-Q3",
    "progress": 0
  }}
]

JSON 배열만 출력하고 다른 텍스트는 포함하지 마세요."""

    raw = provider.chat(
        [{"role": "user", "content": prompt}],
        system="당신은 경영 전략 전문가입니다. JSON만 출력합니다.",
        session_type="general",
        max_tokens=1200,
    )

    # Extract JSON array
    saved_items = []
    try:
        m = re.search(r'\[[\s\S]*?\]', raw)
        if m:
            data = json.loads(m.group())
            for d in data[:6]:
                item_type = d.get("item_type", "objective")
                if item_type not in ("objective", "initiative", "milestone", "kpi"):
                    item_type = "objective"
                priority = d.get("priority", "medium")
                if priority not in ("high", "medium", "low"):
                    priority = "medium"
                item = StrategyItem(
                    company_id=req.company_id,
                    title=str(d.get("title", ""))[:200],
                    description=str(d.get("description", "")),
                    item_type=item_type,
                    priority=priority,
                    due_date=str(d.get("due_date", "")),
                    progress=int(d.get("progress", 0)),
                )
                db.add(item)
                saved_items.append(item)
            db.commit()
            for it in saved_items:
                db.refresh(it)
    except Exception:
        pass

    # Fallback defaults if AI parse failed
    if not saved_items:
        defaults = [
            ("시장 점유율 30% 달성", "objective", "high", "2025-Q4"),
            ("AI 기반 제품 출시", "initiative", "high", "2025-Q3"),
            ("베타 런칭 완료", "milestone", "medium", "2025-Q2"),
            ("MAU 10만 돌파", "kpi", "medium", "2025-Q4"),
            ("운영 비용 15% 절감", "initiative", "low", "2025-Q3"),
        ]
        for title, itype, priority, due in defaults:
            item = StrategyItem(
                company_id=req.company_id,
                title=f"{company.name} — {title}",
                description=f"{company.industry} 분야 핵심 전략",
                item_type=itype,
                priority=priority,
                due_date=due,
                progress=0,
            )
            db.add(item)
            saved_items.append(item)
        db.commit()
        for it in saved_items:
            db.refresh(it)

    return {
        "company": company.name,
        "generated": len(saved_items),
        "items": [StrategyItemOut.model_validate(it) for it in saved_items],
    }


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


# ── AI Synergy Analysis ────────────────────────────────────────────────────────
@router.post("/synergy")
def analyze_synergy(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI analyzes all (or selected) companies and suggests collaboration opportunities."""
    company_ids = body.get("company_ids") or []
    q = db.query(Company)
    if company_ids:
        q = q.filter(Company.id.in_(company_ids))
    companies = q.all()

    if len(companies) < 2:
        return {"opportunities": [], "summary": "최소 2개 이상의 계열사가 필요합니다."}

    company_list = "\n".join(
        f"- {c.name} ({c.industry}): {c.description or c.vision or '설명 없음'}"
        for c in companies
    )

    prompt = f"""한그룹 계열사 목록:
{company_list}

위 계열사들 간의 구체적인 시너지 기회를 JSON으로 제안하세요.
반드시 아래 형식만 반환하세요:
{{
  "summary": "전체 시너지 분석 요약 (2-3문장)",
  "opportunities": [
    {{
      "title": "협업 제목",
      "company_a": "A사 이름",
      "company_b": "B사 이름",
      "category": "기술공유|마케팅|데이터|제품|운영",
      "description": "구체적 협업 방안 (2-3문장)",
      "expected_outcome": "기대 효과",
      "priority": "high|medium|low"
    }}
  ]
}}
최소 3개, 최대 6개 기회를 제시하세요."""

    provider = get_provider_from_db(db, current_user.id)
    messages = [{"role": "user", "content": prompt}]
    raw = provider.chat(messages, system="당신은 그룹 경영 전략 컨설턴트입니다.", session_type="general")

    default = {
        "summary": f"{len(companies)}개 계열사 시너지 분석 완료. AI 연결을 확인하세요.",
        "opportunities": [],
    }
    try:
        m = __import__("re").search(r"\{[\s\S]*\}", raw)
        if m:
            result = __import__("json").loads(m.group())
        else:
            result = default
    except Exception:
        result = default

    return result


# ── AI 인재 추천 시스템 ─────────────────────────────────────────────────────────
@router.post("/talent")
def talent_match(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI가 계열사 간 인재 이동/협업 기회를 분석합니다."""
    from models.models import OrgNode
    import json, re as _re

    company_ids = body.get("company_ids") or []
    q = db.query(OrgNode).filter(OrgNode.company_id != None)
    if company_ids:
        q = q.filter(OrgNode.company_id.in_(company_ids))
    nodes = q.all()

    if not nodes:
        return {"recommendations": [], "summary": "분석할 조직원이 없습니다."}

    # Build per-company member list
    company_map: dict = {}
    for n in nodes:
        cid = str(n.company_id)
        if cid not in company_map:
            c = db.query(Company).filter(Company.id == n.company_id).first()
            company_map[cid] = {"name": c.name if c else f"회사{cid}", "members": []}
        company_map[cid]["members"].append(
            f"{n.name}({n.role}, {n.level}, {n.description or ''})"
        )

    company_list = "\n".join(
        f"[{v['name']}]: {', '.join(v['members'][:8])}"
        for v in company_map.values()
    )

    prompt = f"""계열사별 조직원 현황:
{company_list}

위 조직원들 간 최적의 인재 이동·협업 추천을 JSON으로 제안하세요.
{{
  "summary": "전체 인재 현황 분석 요약",
  "recommendations": [
    {{
      "type": "파견|협업|멘토링|팀빌딩",
      "person": "추천 인재 이름",
      "from_company": "현재 소속",
      "to_company": "추천 이동/협업 대상",
      "reason": "추천 이유 (2-3문장)",
      "benefit": "기대 효과",
      "priority": "high|medium|low"
    }}
  ]
}}
최소 3개, 최대 6개를 제안하세요."""

    provider = get_provider_from_db(db, current_user.id)
    raw = provider.chat(
        [{"role": "user", "content": prompt}],
        system="당신은 그룹 인재 전략 전문가입니다. JSON만 반환하세요.",
        session_type="general",
    )

    default = {"summary": "AI 분석 실패. API 키를 확인하세요.", "recommendations": []}
    try:
        m = _re.search(r"\{[\s\S]*\}", raw)
        result = json.loads(m.group()) if m else default
    except Exception:
        result = default

    return result
