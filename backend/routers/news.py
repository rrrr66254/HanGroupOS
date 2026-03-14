"""
뉴스 API
========
GET  /api/news/search             — 키워드/카테고리 뉴스 검색
GET  /api/news/industry/{industry}— 산업별 뉴스 조회
POST /api/news/briefing           — AI 뉴스 브리핑 생성
GET  /api/news/categories         — 지원 카테고리 목록
GET  /api/news/industries         — 지원 산업 목록 + 키워드

── 구독 관리 ──
POST /api/news/subscriptions                  — 뉴스 구독 생성
GET  /api/news/subscriptions/{company_id}     — 회사 구독 목록
DELETE /api/news/subscriptions/{id}           — 구독 삭제
POST /api/news/subscriptions/{id}/fetch       — 구독 기반 뉴스 즉시 수집
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import NewsFeedSubscription, User
from services.news_service import (
    search_news,
    get_industry_news,
    generate_news_briefing,
    get_news_categories,
    get_industry_list,
)

router = APIRouter(prefix="/api/news", tags=["news"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class BriefingRequest(BaseModel):
    company_id: Optional[int] = None
    industry: Optional[str] = ""
    query: Optional[str] = ""
    max_articles: Optional[int] = 10


class SubscriptionCreateRequest(BaseModel):
    company_id: int
    name: str
    industry: Optional[str] = ""
    keywords: Optional[List[str]] = []
    category: Optional[str] = ""
    country: Optional[str] = "kr"
    language: Optional[str] = "ko"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/search")
def news_search(
    query: str = Query(default="", description="검색 키워드"),
    category: str = Query(default="", description="business|technology|..."),
    country: str = Query(default="kr", description="국가 코드"),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """뉴스 검색 (NewsAPI → Google News RSS 폴백)."""
    return search_news(
        db=db, query=query, category=category,
        country=country, page_size=page_size,
    )


@router.get("/industry/{industry}")
def industry_news(
    industry: str,
    country: str = Query(default="kr"),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """산업별 뉴스 조회."""
    return get_industry_news(
        db=db, industry=industry, country=country, page_size=page_size,
    )


@router.post("/briefing")
def news_briefing(
    req: BriefingRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """AI 뉴스 브리핑 생성 — CEO/회장 의사결정 지원용."""
    return generate_news_briefing(
        db=db,
        company_id=req.company_id,
        industry=req.industry or "",
        query=req.query or "",
        max_articles=req.max_articles or 10,
    )


@router.get("/categories")
def categories(_: User = Depends(get_current_user)):
    """지원하는 뉴스 카테고리 목록."""
    return {"categories": get_news_categories()}


@router.get("/industries")
def industries(_: User = Depends(get_current_user)):
    """지원하는 산업 목록 + 키워드."""
    return {"industries": get_industry_list()}


# ── 구독 관리 ──────────────────────────────────────────────────────────────────

@router.post("/subscriptions")
def create_subscription(
    req: SubscriptionCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """뉴스 피드 구독 생성."""
    sub = NewsFeedSubscription(
        company_id=req.company_id,
        name=req.name,
        industry=req.industry or "",
        keywords=req.keywords or [],
        category=req.category or "",
        country=req.country or "kr",
        language=req.language or "ko",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return {
        "id": sub.id,
        "company_id": sub.company_id,
        "name": sub.name,
        "industry": sub.industry,
        "keywords": sub.keywords,
        "category": sub.category,
        "is_active": sub.is_active,
        "created_at": sub.created_at,
    }


@router.get("/subscriptions/{company_id}")
def list_subscriptions(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """회사별 뉴스 구독 목록."""
    subs = db.query(NewsFeedSubscription).filter(
        NewsFeedSubscription.company_id == company_id,
        NewsFeedSubscription.is_active == True,
    ).order_by(NewsFeedSubscription.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "company_id": s.company_id,
            "name": s.name,
            "industry": s.industry,
            "keywords": s.keywords,
            "category": s.category,
            "country": s.country,
            "last_fetched_at": s.last_fetched_at,
            "created_at": s.created_at,
        }
        for s in subs
    ]


@router.delete("/subscriptions/{subscription_id}")
def delete_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """뉴스 구독 삭제 (비활성화)."""
    sub = db.query(NewsFeedSubscription).filter(
        NewsFeedSubscription.id == subscription_id
    ).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    sub.is_active = False
    sub.updated_at = datetime.utcnow()
    db.commit()
    return {"id": subscription_id, "status": "deleted"}


@router.post("/subscriptions/{subscription_id}/fetch")
def fetch_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """구독 설정 기반으로 뉴스 즉시 수집 + 브리핑 생성."""
    sub = db.query(NewsFeedSubscription).filter(
        NewsFeedSubscription.id == subscription_id,
        NewsFeedSubscription.is_active == True,
    ).first()
    if not sub:
        raise HTTPException(404, "Subscription not found or inactive")

    # 키워드 → 검색 쿼리
    query = " OR ".join(sub.keywords) if sub.keywords else ""

    result = generate_news_briefing(
        db=db,
        company_id=sub.company_id,
        industry=sub.industry or "",
        query=query,
        max_articles=10,
    )

    # 마지막 수집 시간 갱신
    sub.last_fetched_at = datetime.utcnow()
    db.commit()

    result["subscription_id"] = sub.id
    result["subscription_name"] = sub.name
    return result
