"""
데이터 수집 라우터
인터넷 검색, 뉴스, 스크래핑, UN 무역 데이터 수집 및 외부 API 키 관리
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import ExternalApiKey, CollectedData, User
from schemas.schemas import (
    ExternalApiKeyCreate, ExternalApiKeyUpdate, ExternalApiKeyOut,
    WebSearchRequest, NewsSearchRequest, ScrapeRequest,
    RssFetchRequest, ComtradeRequest, CollectedDataOut,
)
from services.data_collector import DataCollector, SERVICE_INFO

router = APIRouter(prefix="/api/data", tags=["data-collection"])


# ── 헬퍼: DB에서 API 키 로드 ──────────────────────────────────────────────────
def _load_api_keys(db: Session) -> dict:
    """DB에 저장된 활성 API 키 로드."""
    keys = {}
    for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all():
        keys[row.service] = row.api_key
    return keys


def _load_extra_configs(db: Session) -> dict:
    """DB에 저장된 활성 extra_config 로드."""
    configs = {}
    for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all():
        if row.extra_config:
            configs[row.service] = row.extra_config
    return configs


def _get_collector(db: Session) -> DataCollector:
    return DataCollector(api_keys=_load_api_keys(db), extra_configs=_load_extra_configs(db))


def _save_collected(
    db: Session,
    data_type: str,
    source: str,
    query: str,
    result: dict,
    company_id: Optional[int] = None,
) -> CollectedData:
    """수집 결과를 DB에 저장."""
    title = result.get("query", "") or result.get("feed_title", "") or source
    content = ""
    if "content" in result:
        content = result["content"]
    elif "articles" in result:
        content = "\n".join(
            f"{a.get('title','')}: {a.get('description','')}"
            for a in result["articles"][:10]
        )
    elif "results" in result:
        content = "\n".join(
            f"{r.get('title','')}: {r.get('snippet','')}"
            for r in result["results"][:10]
        )

    obj = CollectedData(
        company_id=company_id,
        data_type=data_type,
        source=source,
        query=query,
        title=title[:500],
        content=content[:10000],
        structured=result,
        tags=[data_type],
        status="raw",
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


# ══════════════════════════════════════════════════════════════════════════════
# 외부 API 키 관리
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api-keys/services", summary="필요한 외부 API 서비스 목록")
def list_services():
    """
    데이터 수집/미디어 발행에 필요한 외부 API 서비스 목록과
    어떤 키/설정이 필요한지 안내합니다.
    """
    return {"services": SERVICE_INFO}


@router.get("/api-keys", response_model=List[ExternalApiKeyOut], summary="등록된 API 키 목록")
def list_api_keys(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(ExternalApiKey).order_by(ExternalApiKey.service).all()


@router.post("/api-keys", response_model=ExternalApiKeyOut, summary="외부 API 키 등록")
def create_api_key(
    req: ExternalApiKeyCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    새 외부 API 키를 등록합니다.
    service 값: serpapi | newsapi | comtrade | wordpress | tistory | blogger | youtube
    """
    # 동일 서비스가 이미 있으면 업데이트
    existing = db.query(ExternalApiKey).filter(ExternalApiKey.service == req.service).first()
    if existing:
        existing.api_key = req.api_key
        existing.label = req.label or existing.label
        existing.extra_config = req.extra_config if req.extra_config else existing.extra_config
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    obj = ExternalApiKey(
        service=req.service,
        label=req.label or req.service,
        api_key=req.api_key,
        extra_config=req.extra_config,
        is_active=True,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/api-keys/{key_id}", response_model=ExternalApiKeyOut, summary="API 키 수정")
def update_api_key(
    key_id: int,
    req: ExternalApiKeyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obj = db.query(ExternalApiKey).filter(ExternalApiKey.id == key_id).first()
    if not obj:
        raise HTTPException(404, "API 키를 찾을 수 없습니다.")
    if req.label is not None:
        obj.label = req.label
    if req.api_key is not None:
        obj.api_key = req.api_key
    if req.extra_config is not None:
        obj.extra_config = req.extra_config
    if req.is_active is not None:
        obj.is_active = req.is_active
    obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/api-keys/{key_id}", summary="API 키 삭제")
def delete_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obj = db.query(ExternalApiKey).filter(ExternalApiKey.id == key_id).first()
    if not obj:
        raise HTTPException(404, "API 키를 찾을 수 없습니다.")
    db.delete(obj)
    db.commit()
    return {"message": f"{obj.service} API 키가 삭제되었습니다."}


@router.post("/api-keys/{key_id}/test", summary="API 키 연결 테스트")
def test_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """등록된 API 키가 정상 동작하는지 테스트합니다."""
    obj = db.query(ExternalApiKey).filter(ExternalApiKey.id == key_id).first()
    if not obj:
        raise HTTPException(404, "API 키를 찾을 수 없습니다.")

    collector = DataCollector(api_keys={obj.service: obj.api_key})

    if obj.service == "serpapi":
        result = collector.web_search("test", num_results=1)
        ok = "results" in result and not result.get("requires_key")
    elif obj.service == "newsapi":
        result = collector.news_search("test", language="en", days_back=1)
        ok = "articles" in result and result.get("source") == "newsapi"
    elif obj.service == "comtrade":
        result = collector.fetch_comtrade("410", year="2022")
        ok = "data" in result
    else:
        return {"service": obj.service, "status": "test_not_supported",
                "message": "이 서비스는 자동 테스트를 지원하지 않습니다. 실제 발행으로 확인해주세요."}

    obj.last_used_at = datetime.utcnow()
    db.commit()

    return {
        "service": obj.service,
        "status": "ok" if ok else "error",
        "result": result,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 데이터 수집
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/search", summary="웹 검색")
def web_search(
    req: WebSearchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    웹 검색을 수행합니다.
    SerpAPI 키가 등록된 경우 Google 검색 결과를 수집합니다.
    키가 없는 경우 안내 메시지와 함께 키 등록 방법을 알려줍니다.
    """
    collector = _get_collector(db)
    result = collector.web_search(
        query=req.query,
        num_results=req.num_results,
        country=req.country,
        language=req.language,
    )

    saved_id = None
    if req.save_to_db and result.get("results"):
        saved = _save_collected(db, "web_search", "serpapi", req.query, result, req.company_id)
        saved_id = saved.id

    return {**result, "saved_id": saved_id}


@router.post("/news", summary="뉴스 검색")
def news_search(
    req: NewsSearchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    뉴스 기사를 검색합니다.
    NewsAPI 키가 있으면 NewsAPI 사용, 없으면 Google News RSS (무료) 사용.
    """
    collector = _get_collector(db)
    result = collector.news_search(
        query=req.query,
        language=req.language,
        days_back=req.days_back,
    )

    saved_id = None
    articles = result.get("articles", [])
    if req.save_to_db and articles:
        saved = _save_collected(db, "news", result.get("source", "news"), req.query, result, req.company_id)
        saved_id = saved.id

    return {**result, "saved_id": saved_id}


@router.post("/scrape", summary="URL 스크래핑")
def scrape_url(
    req: ScrapeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """특정 URL의 텍스트 콘텐츠를 추출합니다."""
    collector = _get_collector(db)
    result = collector.scrape_url(req.url)

    saved_id = None
    if req.save_to_db and result.get("content"):
        saved = _save_collected(db, "scraped", req.url, req.url, result, req.company_id)
        saved_id = saved.id

    return {**result, "saved_id": saved_id}


@router.post("/rss", summary="RSS/Atom 피드 수집")
def fetch_rss(
    req: RssFetchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """RSS 또는 Atom 피드를 파싱하여 최신 글 목록을 수집합니다."""
    collector = _get_collector(db)
    result = collector.fetch_rss(req.feed_url)

    saved_id = None
    if req.save_to_db and result.get("entries"):
        saved = _save_collected(db, "rss", req.feed_url, req.feed_url, result, req.company_id)
        saved_id = saved.id

    return {**result, "saved_id": saved_id}


@router.post("/trade", summary="UN Comtrade 무역 데이터")
def fetch_trade_data(
    req: ComtradeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    UN Comtrade에서 국제 무역 데이터를 수집합니다.
    무료 (1일 500회), API 키 없이도 기본 사용 가능.
    reporter_code: 410=한국, 156=중국, 840=미국, 392=일본, 276=독일
    """
    collector = _get_collector(db)
    result = collector.fetch_comtrade(
        reporter_code=req.reporter_code,
        partner_code=req.partner_code,
        commodity_code=req.commodity_code,
        year=req.year,
        trade_flow=req.trade_flow,
    )

    saved_id = None
    if req.save_to_db and result.get("data"):
        query_str = f"{req.reporter_code}->{req.partner_code} {req.commodity_code} {req.year}"
        saved = _save_collected(db, "trade", "un_comtrade", query_str, result, req.company_id)
        saved_id = saved.id

    return {**result, "saved_id": saved_id}


# ── 수집 데이터 조회 ──────────────────────────────────────────────────────────

@router.get("/collected", response_model=List[CollectedDataOut], summary="수집된 데이터 목록")
def list_collected(
    data_type: Optional[str] = None,
    company_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(CollectedData)
    if data_type:
        q = q.filter(CollectedData.data_type == data_type)
    if company_id:
        q = q.filter(CollectedData.company_id == company_id)
    return q.order_by(CollectedData.created_at.desc()).limit(limit).all()


@router.get("/collected/{data_id}", response_model=CollectedDataOut, summary="수집 데이터 상세")
def get_collected(
    data_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obj = db.query(CollectedData).filter(CollectedData.id == data_id).first()
    if not obj:
        raise HTTPException(404, "데이터를 찾을 수 없습니다.")
    return obj


@router.delete("/collected/{data_id}", summary="수집 데이터 삭제")
def delete_collected(
    data_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obj = db.query(CollectedData).filter(CollectedData.id == data_id).first()
    if not obj:
        raise HTTPException(404, "데이터를 찾을 수 없습니다.")
    db.delete(obj)
    db.commit()
    return {"message": "삭제되었습니다."}
