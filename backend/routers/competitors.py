"""
경쟁사 모니터링 라우터
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
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
