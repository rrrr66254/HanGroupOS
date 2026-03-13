"""외부 데이터 소스 통합 허브 API."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
from core.database import get_db
from models.models import ExternalDataFeed, ExternalDataCache
from core.logging import get_logger

logger = get_logger("data_feeds")

router = APIRouter(prefix="/api/data-feeds", tags=["data-feeds"])

# 피드 타입별 기본 설정
FEED_TYPES = {
    "rss": {"label": "RSS 피드", "description": "블로그, 뉴스 사이트 RSS/Atom 피드", "requires_url": True},
    "news_api": {"label": "뉴스 API", "description": "NewsAPI.org 키워드 뉴스 검색", "requires_url": False},
    "exchange_rate": {"label": "환율", "description": "주요 통화 실시간 환율", "requires_url": False},
    "stock": {"label": "주가", "description": "주요 주식 시세 조회", "requires_url": False},
}


class FeedCreate(BaseModel):
    name: str
    feed_type: str
    url: str = ""
    config: str = "{}"
    interval_minutes: int = 360
    inject_to_context: bool = True


class FeedUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    config: Optional[str] = None
    interval_minutes: Optional[int] = None
    is_active: Optional[bool] = None
    inject_to_context: Optional[bool] = None


@router.get("/types")
def get_feed_types():
    """지원하는 피드 타입 목록."""
    return {"types": FEED_TYPES}


@router.get("")
def list_feeds(db: Session = Depends(get_db)):
    """등록된 모든 데이터 피드 목록."""
    feeds = db.query(ExternalDataFeed).order_by(ExternalDataFeed.created_at.desc()).all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "feed_type": f.feed_type,
            "url": f.url,
            "config": f.config,
            "interval_minutes": f.interval_minutes,
            "is_active": f.is_active,
            "inject_to_context": f.inject_to_context,
            "last_collected_at": f.last_collected_at.isoformat() if f.last_collected_at else None,
            "cached_items": db.query(ExternalDataCache).filter(ExternalDataCache.feed_id == f.id).count(),
        }
        for f in feeds
    ]


@router.post("")
def create_feed(req: FeedCreate, db: Session = Depends(get_db)):
    """새 데이터 피드 등록."""
    if req.feed_type not in FEED_TYPES:
        raise HTTPException(400, f"지원하지 않는 피드 타입: {req.feed_type}")
    feed = ExternalDataFeed(
        name=req.name,
        feed_type=req.feed_type,
        url=req.url,
        config=req.config,
        interval_minutes=req.interval_minutes,
        inject_to_context=req.inject_to_context,
    )
    db.add(feed)
    db.commit()
    return {"status": "ok", "id": feed.id}


@router.put("/{feed_id}")
def update_feed(feed_id: int, req: FeedUpdate, db: Session = Depends(get_db)):
    """피드 설정 업데이트."""
    feed = db.query(ExternalDataFeed).get(feed_id)
    if not feed:
        raise HTTPException(404, "피드를 찾을 수 없습니다.")
    if req.name is not None:
        feed.name = req.name
    if req.url is not None:
        feed.url = req.url
    if req.config is not None:
        feed.config = req.config
    if req.interval_minutes is not None:
        feed.interval_minutes = req.interval_minutes
    if req.is_active is not None:
        feed.is_active = req.is_active
    if req.inject_to_context is not None:
        feed.inject_to_context = req.inject_to_context
    db.commit()
    return {"status": "ok"}


@router.delete("/{feed_id}")
def delete_feed(feed_id: int, db: Session = Depends(get_db)):
    """피드 삭제."""
    feed = db.query(ExternalDataFeed).get(feed_id)
    if not feed:
        raise HTTPException(404, "피드를 찾을 수 없습니다.")
    db.query(ExternalDataCache).filter(ExternalDataCache.feed_id == feed_id).delete()
    db.delete(feed)
    db.commit()
    return {"status": "ok"}


@router.post("/{feed_id}/collect")
def collect_now(feed_id: int, db: Session = Depends(get_db)):
    """특정 피드 즉시 수집."""
    feed = db.query(ExternalDataFeed).get(feed_id)
    if not feed:
        raise HTTPException(404, "피드를 찾을 수 없습니다.")

    items = _collect_feed(feed, db)
    return {"status": "ok", "collected": len(items)}


@router.get("/{feed_id}/data")
def get_feed_data(feed_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """피드의 캐시된 데이터 조회."""
    rows = db.query(ExternalDataCache).filter(
        ExternalDataCache.feed_id == feed_id
    ).order_by(ExternalDataCache.collected_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "content": r.content[:500],
            "source_url": r.source_url,
            "collected_at": r.collected_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/context-data")
def get_context_data(db: Session = Depends(get_db)):
    """에이전트 컨텍스트 주입용 최신 데이터 요약."""
    feeds = db.query(ExternalDataFeed).filter(
        ExternalDataFeed.is_active == True,
        ExternalDataFeed.inject_to_context == True,
    ).all()

    context_parts = []
    for feed in feeds:
        recent = db.query(ExternalDataCache).filter(
            ExternalDataCache.feed_id == feed.id,
            ExternalDataCache.collected_at >= datetime.utcnow() - timedelta(hours=24),
        ).order_by(ExternalDataCache.collected_at.desc()).limit(5).all()

        if recent:
            items = [f"- {r.title}" for r in recent]
            context_parts.append(f"[{feed.name}]\n" + "\n".join(items))

    return {
        "context": "\n\n".join(context_parts) if context_parts else "",
        "feed_count": len(feeds),
        "has_data": bool(context_parts),
    }


def _collect_feed(feed: ExternalDataFeed, db: Session) -> list:
    """피드 타입별 데이터 수집 (동기)."""
    import httpx

    items = []
    try:
        if feed.feed_type == "rss":
            items = _collect_rss(feed.url)
        elif feed.feed_type == "news_api":
            cfg = json.loads(feed.config or "{}")
            items = _collect_news_api(cfg)
        elif feed.feed_type == "exchange_rate":
            items = _collect_exchange_rate()
        elif feed.feed_type == "stock":
            cfg = json.loads(feed.config or "{}")
            items = _collect_stock(cfg)
    except Exception as e:
        logger.warning("피드 수집 실패 [%s]: %s", feed.name, e)
        return []

    # 캐시에 저장
    for item in items:
        db.add(ExternalDataCache(
            feed_id=feed.id,
            title=item.get("title", "")[:500],
            content=item.get("content", "")[:2000],
            source_url=item.get("url", "")[:500],
        ))
    feed.last_collected_at = datetime.utcnow()
    db.commit()
    return items


def _collect_rss(url: str) -> list:
    """RSS 피드 수집."""
    import httpx
    import xml.etree.ElementTree as ET

    r = httpx.get(url, timeout=15, follow_redirects=True)
    r.raise_for_status()
    root = ET.fromstring(r.text)

    items = []
    # RSS 2.0
    for item in root.findall(".//item")[:20]:
        title = item.findtext("title", "")
        desc = item.findtext("description", "")
        link = item.findtext("link", "")
        items.append({"title": title, "content": desc[:1000], "url": link})
    # Atom
    if not items:
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall(".//atom:entry", ns)[:20]:
            title = entry.findtext("atom:title", "", ns)
            summary = entry.findtext("atom:summary", "", ns)
            link_el = entry.find("atom:link", ns)
            link = link_el.get("href", "") if link_el is not None else ""
            items.append({"title": title, "content": summary[:1000], "url": link})
    return items


def _collect_news_api(config: dict) -> list:
    """NewsAPI.org 뉴스 수집."""
    import httpx

    api_key = config.get("api_key", "")
    query = config.get("query", "technology")
    if not api_key:
        # DB에서 키 조회 시도
        try:
            from core.database import SessionLocal
            from models.models import ExternalApiKey
            with SessionLocal() as s:
                key_row = s.query(ExternalApiKey).filter(ExternalApiKey.service == "newsapi").first()
                if key_row:
                    api_key = key_row.api_key
        except Exception:
            pass
    if not api_key:
        return []

    r = httpx.get(
        "https://newsapi.org/v2/everything",
        params={"q": query, "sortBy": "publishedAt", "pageSize": 10, "apiKey": api_key},
        timeout=15,
    )
    r.raise_for_status()
    articles = r.json().get("articles", [])
    return [
        {"title": a.get("title", ""), "content": a.get("description", "")[:1000], "url": a.get("url", "")}
        for a in articles
    ]


def _collect_exchange_rate() -> list:
    """공개 환율 API (frankfurter.app)."""
    import httpx

    r = httpx.get("https://api.frankfurter.app/latest?from=USD&to=KRW,EUR,JPY,CNY", timeout=10)
    r.raise_for_status()
    data = r.json()
    rates = data.get("rates", {})
    items = []
    for currency, rate in rates.items():
        items.append({
            "title": f"USD/{currency}: {rate}",
            "content": f"1 USD = {rate} {currency} (기준일: {data.get('date', '')})",
            "url": "",
        })
    return items


def _collect_stock(config: dict) -> list:
    """간단한 주가 정보 (placeholder — 실제 API 키 필요 시 확장)."""
    symbols = config.get("symbols", "AAPL,GOOGL,MSFT")
    return [
        {"title": f"주가 모니터링: {symbols}", "content": "주가 API 연동 대기 중. Admin에서 API 키를 등록하세요.", "url": ""}
    ]
