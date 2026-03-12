"""
경쟁사 모니터링 라우터
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.models import Company, CollectedData, ExternalApiKey, User

router = APIRouter(prefix="/api/competitors", tags=["competitors"])


class CompetitorCreateRequest(BaseModel):
    name: str
    industry: str = ""
    keywords: List[str] = []


@router.get("", summary="경쟁사 목록")
def list_competitors(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    companies = db.query(Company).filter(Company.is_competitor == True).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "industry": c.industry,
            "competitor_keywords": c.competitor_keywords,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in companies
    ]


@router.post("", summary="경쟁사 추가")
def create_competitor(
    req: CompetitorCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = Company(
        name=req.name,
        industry=req.industry,
        is_competitor=True,
        competitor_keywords=req.keywords,
        status="active",
        created_by=current_user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return {
        "id": company.id,
        "name": company.name,
        "industry": company.industry,
        "competitor_keywords": company.competitor_keywords,
        "is_competitor": company.is_competitor,
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }


@router.delete("/{competitor_id}", summary="경쟁사 삭제")
def delete_competitor(
    competitor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(
        Company.id == competitor_id,
        Company.is_competitor == True,
    ).first()
    if not company:
        raise HTTPException(404, "경쟁사를 찾을 수 없습니다.")
    db.delete(company)
    db.commit()
    return {"message": f"'{company.name}' 경쟁사가 삭제되었습니다."}


@router.get("/{competitor_id}/news", summary="경쟁사 수집 뉴스 조회")
def get_competitor_news(
    competitor_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(
        Company.id == competitor_id,
        Company.is_competitor == True,
    ).first()
    if not company:
        raise HTTPException(404, "경쟁사를 찾을 수 없습니다.")

    rows = (
        db.query(CollectedData)
        .filter(CollectedData.company_id == competitor_id)
        .order_by(CollectedData.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "competitor_id": competitor_id,
        "competitor_name": company.name,
        "count": len(rows),
        "items": [
            {
                "id": r.id,
                "data_type": r.data_type,
                "source": r.source,
                "title": r.title,
                "content": r.content[:300],
                "tags": r.tags,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.post("/{competitor_id}/collect", summary="경쟁사 뉴스 즉시 수집")
def collect_competitor_news(
    competitor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(
        Company.id == competitor_id,
        Company.is_competitor == True,
    ).first()
    if not company:
        raise HTTPException(404, "경쟁사를 찾을 수 없습니다.")

    from services.data_collector import DataCollector
    from services.data_quality import compute_hash, check_quality, should_save, compute_relevance

    api_keys = {}
    extra_configs = {}
    for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all():
        api_keys[row.service] = row.api_key
        if row.extra_config:
            extra_configs[row.service] = row.extra_config

    collector = DataCollector(api_keys=api_keys, extra_configs=extra_configs)

    keywords = company.competitor_keywords or [company.name]
    query = " ".join(keywords[:3]) if keywords else company.name

    try:
        result = collector.news_search(query=query, language="ko", days_back=1)
    except Exception as e:
        raise HTTPException(500, f"뉴스 수집 실패: {e}")

    articles = result.get("articles", [])
    saved = 0
    skipped = 0

    if articles:
        content = "\n".join(
            f"{a.get('title','')}: {a.get('description','')}"
            for a in articles[:10]
        )
        c_hash = compute_hash(f"[경쟁사] {company.name} 뉴스", content)
        q_flag = check_quality(f"[경쟁사] {company.name} 뉴스", content, c_hash, db)
        ok, reason = should_save(db, result.get("source", "auto"), "news", competitor_id, q_flag)
        if ok:
            rel_score = compute_relevance(content, keywords)
            obj = CollectedData(
                company_id=competitor_id,
                data_type="news",
                source=result.get("source", "auto"),
                query=query,
                title=f"[경쟁사] {company.name} 뉴스",
                content=content[:10000],
                structured=result,
                tags=["competitor", "news", "manual_collect"],
                status="raw",
                content_hash=c_hash,
                relevance_score=rel_score,
                quality_flag=q_flag,
            )
            db.add(obj)
            db.commit()
            saved = 1
        else:
            skipped = 1

    return {
        "competitor_id": competitor_id,
        "competitor_name": company.name,
        "query": query,
        "articles_found": len(articles),
        "saved": saved,
        "skipped": skipped,
        "collected_at": datetime.utcnow().isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# 경쟁사 vs 자사 AI 비교분석
# ══════════════════════════════════════════════════════════════════════════════

class CompareRequest(BaseModel):
    competitor_id: int
    subsidiary_id: int   # 비교 대상 계열사 (is_competitor=False)
    focus: str = ""      # 분석 포커스 (선택)


@router.post("/compare", summary="경쟁사 vs 계열사 AI 비교분석 (계열사 존재 시 사용 가능)")
def compare_competitor(
    req: CompareRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 계열사(is_competitor=False) 존재 확인
    subsidiary_count = db.query(Company).filter(Company.is_competitor == False).count()
    if subsidiary_count == 0:
        raise HTTPException(400, "비교분석은 계열사가 1개 이상 등록된 후 사용 가능합니다.")

    competitor = db.query(Company).filter(
        Company.id == req.competitor_id, Company.is_competitor == True
    ).first()
    if not competitor:
        raise HTTPException(404, "경쟁사를 찾을 수 없습니다.")

    subsidiary = db.query(Company).filter(
        Company.id == req.subsidiary_id, Company.is_competitor == False
    ).first()
    if not subsidiary:
        raise HTTPException(404, "계열사를 찾을 수 없습니다.")

    # 각각 최신 수집 데이터 가져오기
    comp_data = (
        db.query(CollectedData)
        .filter(CollectedData.company_id == req.competitor_id)
        .order_by(CollectedData.created_at.desc())
        .limit(5)
        .all()
    )
    subs_data = (
        db.query(CollectedData)
        .filter(CollectedData.company_id == req.subsidiary_id)
        .order_by(CollectedData.created_at.desc())
        .limit(5)
        .all()
    )

    comp_summary = "\n".join(
        f"- {d.title}: {d.content[:200]}" for d in comp_data
    ) or "(수집된 데이터 없음)"
    subs_summary = "\n".join(
        f"- {d.title}: {d.content[:200]}" for d in subs_data
    ) or "(수집된 데이터 없음)"

    focus_line = f"\n분석 포커스: {req.focus}" if req.focus else ""

    prompt = f"""다음 두 회사를 비교 분석해주세요.{focus_line}

[경쟁사: {competitor.name}] ({competitor.industry})
최신 동향:
{comp_summary}

[자사 계열사: {subsidiary.name}] ({subsidiary.industry})
최신 동향:
{subs_summary}

아래 항목으로 구조화된 비교 분석을 제공하세요:
1. 사업 영역 겹침 / 경쟁 강도
2. 경쟁사 최근 동향 및 위협 요소
3. 자사 계열사의 차별화 강점
4. 전략적 대응 권고사항 (3가지)
5. 종합 평가 (1문장)"""

    from services.ai_provider import get_provider_from_db
    provider = get_provider_from_db(db, current_user.id)
    analysis = provider.chat(
        [{"role": "user", "content": prompt}],
        system="당신은 기업 전략 분석 전문가입니다. 구체적이고 실용적인 분석을 제공합니다.",
        session_type="general",
    )

    return {
        "competitor_id": req.competitor_id,
        "competitor_name": competitor.name,
        "subsidiary_id": req.subsidiary_id,
        "subsidiary_name": subsidiary.name,
        "focus": req.focus,
        "analysis": analysis,
        "analyzed_at": datetime.utcnow().isoformat(),
        "competitor_data_count": len(comp_data),
        "subsidiary_data_count": len(subs_data),
    }


@router.get("/trend", summary="경쟁사별 주간 데이터 수집량 추이 (트렌드 차트용)")
def competitor_trend(
    weeks: int = 8,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """경쟁사별로 최근 N주간 CollectedData 수집 건수를 반환합니다."""
    from sqlalchemy import func

    competitors = db.query(Company).filter(Company.is_competitor == True).all()
    now = datetime.utcnow()
    result = []

    for comp in competitors:
        weekly = []
        for w in range(weeks - 1, -1, -1):
            start = now - timedelta(weeks=w + 1)
            end = now - timedelta(weeks=w)
            cnt = (
                db.query(func.count(CollectedData.id))
                .filter(
                    CollectedData.company_id == comp.id,
                    CollectedData.created_at >= start,
                    CollectedData.created_at < end,
                )
                .scalar()
            ) or 0
            weekly.append({
                "week": (now - timedelta(weeks=w)).strftime("%m/%d"),
                "count": cnt,
            })
        result.append({
            "id": comp.id,
            "name": comp.name,
            "industry": comp.industry,
            "weekly": weekly,
            "total": sum(w["count"] for w in weekly),
        })

    return {"weeks": weeks, "competitors": result}
