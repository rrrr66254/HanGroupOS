"""
데이터 수집 라우터
인터넷 검색, 뉴스, 스크래핑, UN 무역 데이터 수집 및 외부 API 키 관리
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.models import ExternalApiKey, CollectedData, StrategyItem, User, MarketKeywordAlert
from schemas.schemas import (
    ExternalApiKeyCreate, ExternalApiKeyUpdate, ExternalApiKeyOut,
    WebSearchRequest, NewsSearchRequest, ScrapeRequest,
    RssFetchRequest, ComtradeRequest, CollectedDataOut,
)
from services.data_quality import (
    compute_hash, compute_relevance, check_quality, should_save,
    cleanup_old_data, dedup_data, get_quality_report,
)
from services.data_collector import DataCollector, SERVICE_INFO
from services.ai_provider import get_provider_from_db, MARKET_ANALYST_SYSTEM


# ── 신규 수집 요청 스키마 ────────────────────────────────────────────────────────
class HackernewsCollectRequest(BaseModel):
    limit: int = 15
    company_id: Optional[int] = None
    save: bool = True

class WorldBankCollectRequest(BaseModel):
    indicator: str = "NY.GDP.MKTP.KD.ZG"  # GDP 성장률
    country: str = "KR"
    company_id: Optional[int] = None
    save: bool = True

class RedditCollectRequest(BaseModel):
    subreddit: str = "technology"
    limit: int = 20
    company_id: Optional[int] = None
    save: bool = True

class DartCollectRequest(BaseModel):
    company_name: str = ""
    days_back: int = 7
    company_id: Optional[int] = None
    save: bool = True

class EcosCollectRequest(BaseModel):
    stat_code: str = "722Y001"   # 기준금리
    item_code: str = "*AA"
    period_type: str = "M"
    company_id: Optional[int] = None
    save: bool = True

class FredCollectRequest(BaseModel):
    series_id: str = "DEXKOUS"  # 원달러 환율
    company_id: Optional[int] = None
    save: bool = True

class AlphaVantageCollectRequest(BaseModel):
    symbol: str = "005930.KS"   # 삼성전자
    function: str = "TIME_SERIES_DAILY"
    company_id: Optional[int] = None
    save: bool = True

class KosisCollectRequest(BaseModel):
    org_id: str = "101"          # 기관코드 (101=통계청, 301=한국은행)
    tbl_id: str = "DT_1DA7003S"  # 통계표ID (경제활동인구)
    item_id: str = "T1"
    start_prd_de: Optional[str] = None  # YYYYMM
    end_prd_de: Optional[str] = None
    page_size: int = 50
    company_id: Optional[int] = None
    save: bool = True

class AlertCreateRequest(BaseModel):
    keyword: str
    company_id: Optional[int] = None

class AlertToggleRequest(BaseModel):
    is_active: bool

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
    keywords: Optional[List[str]] = None,
) -> Optional[CollectedData]:
    """수집 결과를 DB에 저장 (중복/용량/품질 필터 적용)."""
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

    title = title[:500]
    content = content[:10000]

    # 해시 계산 + 품질 체크
    c_hash = compute_hash(title, content)
    q_flag = check_quality(title, content, c_hash, db)

    # 저장 여부 판단
    ok, reason = should_save(db, source, data_type, company_id, q_flag)
    if not ok:
        return None  # 중복/용량 초과 스킵

    # 관련성 점수
    rel_score = compute_relevance(content, keywords or []) if keywords else None

    obj = CollectedData(
        company_id=company_id,
        data_type=data_type,
        source=source,
        query=query,
        title=title,
        content=content,
        structured=result,
        tags=[data_type],
        status="raw",
        content_hash=c_hash,
        relevance_score=rel_score,
        quality_flag=q_flag,
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

    result = _test_connection(obj.service, obj.api_key)

    if result["ok"] is None:
        return {"service": obj.service, "status": "test_not_supported",
                "message": result["message"]}

    obj.last_used_at = datetime.utcnow()
    db.commit()

    return {
        "service": obj.service,
        "status": "ok" if result["ok"] else "error",
        "message": result["message"],
    }


def _test_connection(service: str, api_key: str) -> dict:
    """서비스별 연결 테스트. {"ok": bool|None, "message": str} 반환
    ok=True: 성공, ok=False: 실패, ok=None: 테스트 미지원
    """
    import requests as _req
    try:
        if service == "huggingface":
            r = _req.get(
                "https://huggingface.co/api/whoami",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=8,
            )
            ok = r.status_code == 200
            if ok:
                name = r.json().get("name", "")
                msg = f"인증 성공 (계정: {name})" if name else "인증 성공"
            else:
                msg = f"인증 실패 (HTTP {r.status_code})"

        elif service == "json2video":
            r = _req.get(
                "https://api.json2video.com/v2/movies",
                headers={"x-api-key": api_key},
                timeout=8,
            )
            # 200 or 404 (키 유효, 결과 없음) → 키 자체는 유효
            ok = r.status_code in (200, 404)
            msg = "API 키 유효" if ok else f"인증 실패 (HTTP {r.status_code})"

        elif service == "serpapi":
            r = _req.get(
                "https://serpapi.com/search",
                params={"q": "test", "api_key": api_key, "num": 1},
                timeout=8,
            )
            data = r.json()
            ok = r.status_code == 200 and "organic_results" in data
            msg = "연결 성공" if ok else data.get("error", "연결 실패")

        elif service == "newsapi":
            r = _req.get(
                "https://newsapi.org/v2/top-headlines",
                params={"country": "us", "pageSize": 1, "apiKey": api_key},
                timeout=8,
            )
            ok = r.status_code == 200
            msg = "연결 성공" if ok else f"연결 실패 (HTTP {r.status_code})"

        elif service == "comtrade":
            collector = DataCollector(api_keys={"comtrade": api_key})
            result = collector.fetch_comtrade("410", year="2022")
            ok = "data" in result
            msg = "연결 성공" if ok else "연결 실패"

        else:
            return {"ok": None, "message": "테스트 미지원 서비스 — 실제 사용으로 확인하세요"}

        return {"ok": ok, "message": msg}

    except Exception as e:
        return {"ok": False, "message": f"연결 오류: {str(e)[:100]}"}


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


# ══════════════════════════════════════════════════════════════════════════════
# 전략 자동 인사이트
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/insights/{company_id}", summary="수집 데이터 → 전략 자동 인사이트")
def generate_insights(
    company_id: int,
    limit: int = 20,
    save: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    최근 수집 데이터(뉴스·검색·스크래핑)를 MARKET_ANALYST AI로 분석해
    전략 시사점을 자동 생성합니다.
    save=true 이면 StrategyItem으로도 저장합니다.
    """
    rows = (
        db.query(CollectedData)
        .filter(CollectedData.company_id == company_id)
        .order_by(CollectedData.created_at.desc())
        .limit(limit)
        .all()
    )

    if not rows:
        raise HTTPException(404, "분석할 수집 데이터가 없습니다. 먼저 뉴스/검색을 수집하세요.")

    # 수집 데이터를 텍스트로 직렬화
    data_text = ""
    for i, row in enumerate(rows, 1):
        data_text += f"\n[{i}] [{row.data_type}] {row.title}\n{row.content[:500]}\n"

    prompt = (
        f"아래는 최근 수집된 시장 데이터 {len(rows)}건입니다.\n"
        f"이 데이터를 바탕으로 전략적 인사이트 3~5가지를 도출해주세요.\n"
        f"각 인사이트는 구체적 근거와 추천 액션을 포함해주세요.\n\n"
        f"{data_text}"
    )

    provider = get_provider_from_db(db, current_user.id)
    insights = provider.chat(
        [{"role": "user", "content": prompt}],
        system=MARKET_ANALYST_SYSTEM,
        session_type="general",
    )

    saved_id = None
    if save:
        item = StrategyItem(
            company_id=company_id,
            title=f"AI 인사이트 ({datetime.utcnow().strftime('%Y-%m-%d')})",
            description=insights,
            item_type="initiative",
            status="active",
            priority="high",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        saved_id = item.id

    return {
        "insights": insights,
        "data_count": len(rows),
        "generated_at": datetime.utcnow().isoformat(),
        "saved_strategy_id": saved_id,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 전문 검색 (SQLite FTS5)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/search", summary="수집 데이터 전문 검색")
def search_collected(
    q: str,
    company_id: Optional[int] = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    수집 데이터를 키워드로 전문 검색합니다.
    SQLite FTS5를 사용하며, 미지원 환경에서는 LIKE 검색으로 폴백합니다.
    """
    if not q or len(q.strip()) < 1:
        raise HTTPException(400, "검색어를 입력하세요.")

    from sqlalchemy import text as sa_text

    results = []
    try:
        # FTS5 가상 테이블 존재 여부 확인 및 생성
        db.execute(sa_text(
            "CREATE VIRTUAL TABLE IF NOT EXISTS collected_data_fts "
            "USING fts5(title, content, content=collected_data, content_rowid=id, tokenize='unicode61')"
        ))
        db.commit()

        # FTS 인덱스 재구축 (content 테이블 기반)
        db.execute(sa_text("INSERT OR IGNORE INTO collected_data_fts(collected_data_fts) VALUES('rebuild')"))
        db.commit()

        # FTS5 MATCH 검색
        fts_sql = sa_text(
            "SELECT cd.* FROM collected_data cd "
            "JOIN collected_data_fts fts ON cd.id = fts.rowid "
            "WHERE collected_data_fts MATCH :q "
            + ("AND cd.company_id = :cid " if company_id else "")
            + "ORDER BY rank LIMIT :lim"
        )
        params = {"q": q, "lim": limit}
        if company_id:
            params["cid"] = company_id

        rows = db.execute(fts_sql, params).fetchall()
        ids = [r[0] for r in rows]
        if ids:
            results = db.query(CollectedData).filter(CollectedData.id.in_(ids)).all()

    except Exception:
        # FTS5 미지원 → LIKE 폴백
        keyword = f"%{q}%"
        qry = db.query(CollectedData).filter(
            (CollectedData.title.ilike(keyword)) | (CollectedData.content.ilike(keyword))
        )
        if company_id:
            qry = qry.filter(CollectedData.company_id == company_id)
        results = qry.order_by(CollectedData.created_at.desc()).limit(limit).all()

    return {
        "query": q,
        "count": len(results),
        "results": [
            {
                "id": r.id,
                "data_type": r.data_type,
                "title": r.title,
                "content": r.content[:300],
                "source": r.source,
                "company_id": r.company_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
# 무료 데이터 소스 수집 엔드포인트
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_free_content(result: dict, data_key: str, title_field: str = "title") -> str:
    """무료 소스 결과 → CollectedData.content 포맷."""
    items = result.get(data_key, [])
    return "\n".join(
        f"{i.get(title_field, '') or i.get('date', '') or str(i)}"
        f"{': ' + str(i.get('value','')) if i.get('value') is not None else ''}"
        for i in items[:20]
    )[:10000]


@router.post("/collect/hackernews", summary="HackerNews 트렌드 수집 (무료)")
def collect_hackernews(
    req: HackernewsCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """HackerNews 상위 스토리 수집 (완전 무료, API 키 불필요)."""
    collector = _get_collector(db)
    result = collector.collect_hackernews(limit=req.limit)
    saved_id = None
    if req.save and result.get("stories"):
        content = "\n".join(
            f"{s.get('title','')}: {s.get('url','')}"
            for s in result["stories"]
        )[:10000]
        obj = CollectedData(
            company_id=req.company_id,
            data_type="tech_trend",
            source="hackernews",
            query="hackernews_top",
            title=f"[HackerNews] Top {len(result['stories'])} Stories ({datetime.utcnow().strftime('%Y-%m-%d')})",
            content=content,
            structured=result,
            tags=["hackernews", "tech", "trend", "free"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/worldbank", summary="World Bank 거시경제 지표 수집 (무료)")
def collect_worldbank(
    req: WorldBankCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """World Bank API로 GDP·무역·물가 등 거시경제 지표 수집 (완전 무료)."""
    collector = _get_collector(db)
    result = collector.collect_worldbank(indicator=req.indicator, country=req.country)
    saved_id = None
    if req.save and result.get("data"):
        content = _fmt_free_content(result, "data", "year")
        obj = CollectedData(
            company_id=req.company_id,
            data_type="economic",
            source="worldbank",
            query=f"{req.country}:{req.indicator}",
            title=f"[World Bank] {req.indicator} ({req.country})",
            content=content,
            structured=result,
            tags=["worldbank", "economic", "macro", "free"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/reddit", summary="Reddit 커뮤니티 트렌드 수집 (무료)")
def collect_reddit(
    req: RedditCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Reddit 서브레딧 인기 게시글 수집 (완전 무료, 키 불필요)."""
    collector = _get_collector(db)
    result = collector.collect_reddit(subreddit=req.subreddit, limit=req.limit)
    saved_id = None
    if req.save and result.get("posts"):
        content = "\n".join(
            f"{p.get('title','')}: {p.get('url','')}"
            for p in result["posts"]
        )[:10000]
        obj = CollectedData(
            company_id=req.company_id,
            data_type="community",
            source="reddit",
            query=f"r/{req.subreddit}",
            title=f"[Reddit] r/{req.subreddit} Hot Posts",
            content=content,
            structured=result,
            tags=["reddit", "community", "trend", "free"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/kosis", summary="KOSIS 국가통계포털 데이터 수집")
def collect_kosis(
    req: KosisCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """KOSIS 국가통계포털 — 인구·고용·물가 등 공식 국가통계 수집 (무료 키 필요)."""
    collector = _get_collector(db)
    result = collector.collect_kosis(
        org_id=req.org_id,
        tbl_id=req.tbl_id,
        item_id=req.item_id,
        start_prd_de=req.start_prd_de,
        end_prd_de=req.end_prd_de,
        page_size=req.page_size,
    )
    saved_id = None
    if req.save and result.get("data"):
        content = "\n".join(
            f"{d.get('period','')} {d.get('item_name','')}: {d.get('value','')} {d.get('unit','')}"
            for d in result["data"][:50]
        )[:10000]
        obj = CollectedData(
            company_id=req.company_id,
            data_type="statistics",
            source="kosis",
            query=f"{req.org_id}/{req.tbl_id}",
            title=f"[KOSIS] {req.tbl_id} 통계 ({result.get('period','')})",
            content=content,
            structured=result,
            tags=["kosis", "statistics", "korea", "government"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/dart", summary="DART 금융감독원 공시 수집")
def collect_dart(
    req: DartCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """DART 금융감독원 공시 수집 (무료 API 키 필요 — opendart.fss.or.kr)."""
    collector = _get_collector(db)
    result = collector.collect_dart(company_name=req.company_name, days_back=req.days_back)
    saved_id = None
    if req.save and result.get("disclosures"):
        content = "\n".join(
            f"{d.get('date','')} [{d.get('company','')}] {d.get('title','')}"
            for d in result["disclosures"]
        )[:10000]
        obj = CollectedData(
            company_id=req.company_id,
            data_type="disclosure",
            source="dart",
            query=req.company_name or "전체",
            title=f"[DART] {req.company_name or '전체'} 공시 ({req.days_back}일)",
            content=content,
            structured=result,
            tags=["dart", "disclosure", "korea", "stock"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/ecos", summary="한국은행 경제통계 수집")
def collect_ecos(
    req: EcosCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """한국은행 ECOS API로 금리·환율·GDP 등 경제통계 수집 (무료 키 필요 — ecos.bok.or.kr)."""
    collector = _get_collector(db)
    result = collector.collect_ecos(
        stat_code=req.stat_code, item_code=req.item_code, period_type=req.period_type
    )
    saved_id = None
    if req.save and result.get("data"):
        content = _fmt_free_content(result, "data", "period")
        obj = CollectedData(
            company_id=req.company_id,
            data_type="economic",
            source="ecos",
            query=req.stat_code,
            title=f"[ECOS] 통계코드 {req.stat_code}",
            content=content,
            structured=result,
            tags=["ecos", "economic", "korea", "macro"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/fred", summary="FRED 미국 연준 경제지표 수집")
def collect_fred(
    req: FredCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """FRED API로 미국 금리·환율·GDP 등 수집 (무료 키 필요 — fred.stlouisfed.org)."""
    collector = _get_collector(db)
    result = collector.collect_fred(series_id=req.series_id)
    saved_id = None
    if req.save and result.get("data"):
        content = _fmt_free_content(result, "data", "date")
        obj = CollectedData(
            company_id=req.company_id,
            data_type="economic",
            source="fred",
            query=req.series_id,
            title=f"[FRED] {req.series_id}",
            content=content,
            structured=result,
            tags=["fred", "economic", "us", "macro"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


@router.post("/collect/alphavantage", summary="Alpha Vantage 주가 데이터 수집")
def collect_alphavantage(
    req: AlphaVantageCollectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Alpha Vantage API로 주가·환율 데이터 수집 (무료 키 필요, 분당 5회 제한)."""
    collector = _get_collector(db)
    result = collector.collect_alphavantage(symbol=req.symbol, function=req.function)
    saved_id = None
    if req.save and result.get("data"):
        content = _fmt_free_content(result, "data", "date")
        obj = CollectedData(
            company_id=req.company_id,
            data_type="stock",
            source="alphavantage",
            query=req.symbol,
            title=f"[Alpha Vantage] {req.symbol} 주가",
            content=content,
            structured=result,
            tags=["alphavantage", "stock", "price"],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
    return {**result, "saved_id": saved_id}


# ══════════════════════════════════════════════════════════════════════════════
# 시장 모니터링 알림 키워드 관리 (Task C)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/alerts", summary="내 시장 알림 키워드 목록")
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alerts = (
        db.query(MarketKeywordAlert)
        .filter(MarketKeywordAlert.user_id == current_user.id)
        .order_by(MarketKeywordAlert.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id, "keyword": a.keyword, "company_id": a.company_id,
            "is_active": a.is_active,
            "last_triggered_at": a.last_triggered_at.isoformat() if a.last_triggered_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in alerts
    ]


@router.post("/alerts", summary="시장 알림 키워드 등록")
def create_alert(
    req: AlertCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not req.keyword.strip():
        raise HTTPException(400, "키워드를 입력하세요.")
    # 중복 방지
    existing = db.query(MarketKeywordAlert).filter(
        MarketKeywordAlert.user_id == current_user.id,
        MarketKeywordAlert.keyword == req.keyword.strip(),
        MarketKeywordAlert.company_id == req.company_id,
    ).first()
    if existing:
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "keyword": existing.keyword, "is_active": True, "message": "알림이 재활성화되었습니다."}

    alert = MarketKeywordAlert(
        keyword=req.keyword.strip(),
        company_id=req.company_id,
        user_id=current_user.id,
        is_active=True,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {"id": alert.id, "keyword": alert.keyword, "company_id": alert.company_id,
            "is_active": True, "message": "키워드 알림이 등록되었습니다."}


@router.patch("/alerts/{alert_id}", summary="알림 활성화/비활성화")
def toggle_alert(
    alert_id: int,
    req: AlertToggleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(MarketKeywordAlert).filter(
        MarketKeywordAlert.id == alert_id,
        MarketKeywordAlert.user_id == current_user.id,
    ).first()
    if not alert:
        raise HTTPException(404, "알림을 찾을 수 없습니다.")
    alert.is_active = req.is_active
    db.commit()
    return {"id": alert.id, "keyword": alert.keyword, "is_active": alert.is_active}


@router.delete("/alerts/{alert_id}", summary="알림 삭제")
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(MarketKeywordAlert).filter(
        MarketKeywordAlert.id == alert_id,
        MarketKeywordAlert.user_id == current_user.id,
    ).first()
    if not alert:
        raise HTTPException(404, "알림을 찾을 수 없습니다.")
    db.delete(alert)
    db.commit()
    return {"message": f"'{alert.keyword}' 알림이 삭제되었습니다."}


# ══════════════════════════════════════════════════════════════════════════════
# 데이터 통계 & 내보내기 (Task D)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/stats", summary="수집 데이터 통계")
def get_data_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """수집 데이터 현황 통계 (전체/회사별/타입별/날짜별)."""
    total = db.query(CollectedData).count()

    # 타입별
    by_type_rows = (
        db.query(CollectedData.data_type, func.count(CollectedData.id))
        .group_by(CollectedData.data_type)
        .all()
    )
    by_type = {row[0]: row[1] for row in by_type_rows}

    # 소스별
    by_source_rows = (
        db.query(CollectedData.source, func.count(CollectedData.id))
        .group_by(CollectedData.source)
        .order_by(func.count(CollectedData.id).desc())
        .limit(10)
        .all()
    )
    by_source = {row[0]: row[1] for row in by_source_rows}

    # 회사별 상위 10
    by_company_rows = (
        db.query(CollectedData.company_id, func.count(CollectedData.id))
        .filter(CollectedData.company_id != None)
        .group_by(CollectedData.company_id)
        .order_by(func.count(CollectedData.id).desc())
        .limit(10)
        .all()
    )
    by_company = {str(row[0]): row[1] for row in by_company_rows}

    # 최근 7일 일별 수집량
    daily = []
    for i in range(6, -1, -1):
        day = datetime.utcnow().date() - timedelta(days=i)
        cnt = db.query(CollectedData).filter(
            func.date(CollectedData.created_at) == day
        ).count()
        daily.append({"date": day.isoformat(), "count": cnt})

    # 금일 수집량
    today = datetime.utcnow().date()
    today_count = db.query(CollectedData).filter(
        func.date(CollectedData.created_at) == today
    ).count()

    return {
        "total": total,
        "today": today_count,
        "by_type": by_type,
        "by_source": by_source,
        "by_company": by_company,
        "daily_7days": daily,
    }


@router.get("/flow", summary="데이터 흐름 관계 시각화용 통계")
def get_data_flow(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    수집 데이터 → 인사이트(StrategyItem) → 전략목표 관계 노드/링크 반환.
    Sankey 차트 렌더링에 사용.
    """
    # 1. 소스별 수집량
    source_q = (
        db.query(CollectedData.source, CollectedData.data_type, func.count(CollectedData.id))
        .group_by(CollectedData.source, CollectedData.data_type)
    )
    if company_id:
        source_q = source_q.filter(
            (CollectedData.company_id == company_id) | (CollectedData.company_id == None)
        )
    source_rows = source_q.order_by(func.count(CollectedData.id).desc()).limit(12).all()

    # 2. 타입별 수집량
    type_q = db.query(CollectedData.data_type, func.count(CollectedData.id)).group_by(CollectedData.data_type)
    if company_id:
        type_q = type_q.filter(
            (CollectedData.company_id == company_id) | (CollectedData.company_id == None)
        )
    type_rows = type_q.all()

    # 3. StrategyItem (인사이트 포함)
    from models.models import StrategyItem
    item_q = db.query(StrategyItem.item_type, func.count(StrategyItem.id)).group_by(StrategyItem.item_type)
    if company_id:
        item_q = item_q.filter(StrategyItem.company_id == company_id)
    item_rows = item_q.all()

    # 노드 구성: 소스 → 타입 → 전략
    nodes = []
    links = []

    source_label_map = {
        "hackernews": "HackerNews", "worldbank": "World Bank", "reddit": "Reddit",
        "dart": "DART", "ecos": "ECOS", "kosis": "KOSIS", "fred": "FRED",
        "alphavantage": "Alpha Vantage", "serpapi": "SerpAPI", "newsapi": "NewsAPI",
        "auto": "자동수집", "un_comtrade": "UN Comtrade", "google_news_rss_free": "Google RSS",
    }

    type_label_map = {
        "news": "뉴스", "tech_trend": "기술트렌드", "economic": "경제지표",
        "community": "커뮤니티", "disclosure": "공시", "stock": "주가",
        "web_search": "웹검색", "trade": "무역", "scraped": "스크래핑",
        "rss": "RSS", "statistics": "국가통계",
    }

    strategy_label_map = {
        "objective": "전략목표", "milestone": "마일스톤", "initiative": "이니셔티브",
        "kpi": "KPI", "risk": "리스크",
    }

    # 소스 노드
    added_sources = set()
    added_types = set()
    for src, dtype, cnt in source_rows:
        src_label = source_label_map.get(src, src)
        type_label = type_label_map.get(dtype, dtype)

        if src_label not in added_sources:
            nodes.append({"id": f"src_{src}", "label": src_label, "group": "source", "value": 0})
            added_sources.add(src_label)

        if type_label not in added_types:
            nodes.append({"id": f"type_{dtype}", "label": type_label, "group": "type", "value": 0})
            added_types.add(type_label)

        links.append({"source": f"src_{src}", "target": f"type_{dtype}", "value": cnt})

    # 타입 합계 업데이트
    type_totals = {dtype: cnt for dtype, cnt in type_rows}
    for n in nodes:
        if n["group"] == "type":
            dtype = n["id"].replace("type_", "")
            n["value"] = type_totals.get(dtype, 0)

    # 전략 노드
    total_data = sum(type_totals.values()) if type_totals else 0
    for itype, cnt in item_rows:
        label = strategy_label_map.get(itype, itype)
        nodes.append({"id": f"strategy_{itype}", "label": label, "group": "strategy", "value": cnt})
        # 타입 → 전략 링크 (임의 분배: 전체 데이터의 비율로)
        if total_data > 0:
            for dtype, dcnt in type_totals.items():
                proportion = dcnt / total_data
                link_val = max(1, int(cnt * proportion))
                links.append({"source": f"type_{dtype}", "target": f"strategy_{itype}", "value": link_val})

    return {
        "nodes": nodes,
        "links": links,
        "summary": {
            "total_collected": total_data,
            "source_count": len(added_sources),
            "type_count": len(type_totals),
            "strategy_items": sum(cnt for _, cnt in item_rows),
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# 데이터 품질 관리
# ══════════════════════════════════════════════════════════════════════════════

class CleanupRequest(BaseModel):
    raw_days: int = 30
    processed_days: int = 90

@router.get("/quality", summary="데이터 품질 리포트")
def data_quality_report(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """중복률·저품질률·용량 사용률·만료 예정 등 품질 리포트."""
    return get_quality_report(db)


@router.post("/quality/cleanup", summary="오래된 데이터 정리")
def data_cleanup(
    req: CleanupRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    raw_days일 이상 된 raw 데이터 + processed_days일 이상 된 processed 데이터 삭제.
    기본값: raw 30일, processed 90일
    """
    result = cleanup_old_data(db, raw_days=req.raw_days, processed_days=req.processed_days)
    return {**result, "message": f"정리 완료 — 총 {result['total_deleted']}건 삭제"}


@router.post("/quality/dedup", summary="중복 데이터 제거")
def data_dedup(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """content_hash 기준 중복 레코드 제거 (최신 것 보존)."""
    result = dedup_data(db)
    return {**result, "message": f"중복 제거 완료 — {result['duplicates_removed']}건 삭제"}


@router.post("/quality/hash-all", summary="기존 데이터 해시 일괄 계산")
def hash_existing_data(
    limit: int = 1000,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """hash/quality_flag 없는 기존 데이터에 일괄 적용 (마이그레이션용)."""
    rows = (
        db.query(CollectedData)
        .filter(CollectedData.content_hash == None)
        .limit(limit)
        .all()
    )
    updated = 0
    for row in rows:
        c_hash = compute_hash(row.title or "", row.content or "")
        row.content_hash = c_hash
        if not row.quality_flag:
            flag = check_quality(row.title or "", row.content or "", c_hash, db)
            row.quality_flag = flag
        updated += 1
    db.commit()
    return {"updated": updated, "message": f"{updated}건 해시/품질플래그 적용 완료"}


@router.get("/export/{company_id}", summary="수집 데이터 JSON 내보내기")
def export_data(
    company_id: int,
    limit: int = 500,
    data_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """회사별 수집 데이터를 JSON 파일로 내보냅니다."""
    q = db.query(CollectedData).filter(CollectedData.company_id == company_id)
    if data_type:
        q = q.filter(CollectedData.data_type == data_type)
    rows = q.order_by(CollectedData.created_at.desc()).limit(limit).all()

    export_data_list = [
        {
            "id": r.id,
            "data_type": r.data_type,
            "source": r.source,
            "query": r.query,
            "title": r.title,
            "content": r.content,
            "tags": r.tags,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

    filename = f"han_group_data_{company_id}_{datetime.utcnow().strftime('%Y%m%d')}.json"
    return JSONResponse(
        content={"company_id": company_id, "count": len(export_data_list),
                 "exported_at": datetime.utcnow().isoformat(), "data": export_data_list},
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
