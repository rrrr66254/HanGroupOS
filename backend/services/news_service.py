"""
뉴스 서비스
==========
- NewsAPI를 통한 산업/키워드 뉴스 검색
- 회사별 뉴스 피드 구독 (카테고리/키워드)
- AI 기반 뉴스 브리핑 자동 생성 (CEO 에이전트용)
- NewsAPI 키 없을 시 Google News RSS 폴백
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from core.logging import get_logger

logger = get_logger("service.news")

# ── NewsAPI 카테고리 ─────────────────────────────────────────────────────────
NEWSAPI_CATEGORIES = [
    "business", "entertainment", "general", "health",
    "science", "sports", "technology",
]

# ── 산업별 기본 키워드 매핑 ──────────────────────────────────────────────────
INDUSTRY_KEYWORDS = {
    "IT": ["AI", "클라우드", "SaaS", "사이버보안", "반도체"],
    "게임": ["게임", "e스포츠", "메타버스", "VR", "게임산업"],
    "금융": ["핀테크", "블록체인", "은행", "투자", "금리"],
    "제조": ["스마트팩토리", "자동화", "공급망", "ESG", "제조업"],
    "미디어": ["OTT", "콘텐츠", "스트리밍", "광고", "미디어"],
    "바이오": ["바이오", "제약", "헬스케어", "임상시험", "의료"],
    "에너지": ["신재생에너지", "탄소중립", "ESG", "수소", "배터리"],
    "부동산": ["부동산", "건설", "프롭테크", "리츠", "임대"],
    "유통": ["이커머스", "리테일", "물류", "라스트마일", "유통"],
}


def search_news(
    db: Session,
    query: str = "",
    category: str = "",
    country: str = "kr",
    page_size: int = 10,
    language: str = "ko",
) -> Dict[str, Any]:
    """
    NewsAPI everything/top-headlines 검색.
    API 키 없으면 Google News RSS 폴백.
    """
    from core.utils import get_active_api_key

    newsapi_key_row = get_active_api_key(db, "newsapi")
    results = []
    source_used = "none"

    if newsapi_key_row:
        try:
            import httpx
            _update_last_used(db, newsapi_key_row)

            if query:
                # everything 엔드포인트 (키워드 검색)
                resp = httpx.get(
                    "https://newsapi.org/v2/everything",
                    params={
                        "q": query,
                        "language": language,
                        "pageSize": min(page_size, 100),
                        "sortBy": "publishedAt",
                    },
                    headers={"X-Api-Key": newsapi_key_row.api_key},
                    timeout=15.0,
                )
            else:
                # top-headlines 엔드포인트 (카테고리 검색)
                params = {
                    "country": country,
                    "pageSize": min(page_size, 100),
                }
                if category and category in NEWSAPI_CATEGORIES:
                    params["category"] = category
                resp = httpx.get(
                    "https://newsapi.org/v2/top-headlines",
                    params=params,
                    headers={"X-Api-Key": newsapi_key_row.api_key},
                    timeout=15.0,
                )

            data = resp.json()
            if data.get("status") == "ok":
                for article in data.get("articles", [])[:page_size]:
                    results.append({
                        "title": article.get("title", ""),
                        "description": article.get("description", ""),
                        "url": article.get("url", ""),
                        "image": article.get("urlToImage", ""),
                        "source": article.get("source", {}).get("name", ""),
                        "author": article.get("author", ""),
                        "published_at": article.get("publishedAt", ""),
                    })
                source_used = "newsapi"
            else:
                logger.warning(f"[News] NewsAPI 오류: {data.get('message', '')}")
        except Exception as e:
            logger.warning(f"[News] NewsAPI 실패, RSS 폴백: {e}")

    # 폴백: Google News RSS
    if not results:
        results, source_used = _fallback_google_rss(query or category or "한국 비즈니스")

    return {
        "query": query,
        "category": category,
        "country": country,
        "source": source_used,
        "count": len(results),
        "articles": results,
    }


def get_industry_news(
    db: Session,
    industry: str,
    country: str = "kr",
    page_size: int = 10,
) -> Dict[str, Any]:
    """산업 키워드 기반 뉴스 수집."""
    keywords = INDUSTRY_KEYWORDS.get(industry, [industry])
    query = " OR ".join(keywords)
    result = search_news(db, query=query, country=country, page_size=page_size)
    result["industry"] = industry
    result["keywords"] = keywords
    return result


def generate_news_briefing(
    db: Session,
    company_id: Optional[int] = None,
    industry: str = "",
    query: str = "",
    max_articles: int = 10,
) -> Dict[str, Any]:
    """
    AI가 뉴스 기사를 분석해 CEO/회장 브리핑 문서 생성.
    """
    from services.ai_provider import AIProvider
    import json as _json

    # 1) 뉴스 수집
    if industry:
        news_result = get_industry_news(db, industry=industry, page_size=max_articles)
    else:
        news_result = search_news(db, query=query or "한국 경제 산업", page_size=max_articles)

    articles = news_result.get("articles", [])
    if not articles:
        return {
            "status": "no_articles",
            "message": "수집된 뉴스가 없습니다.",
            "briefing": None,
        }

    # 2) 기사 텍스트 준비
    article_texts = []
    for i, a in enumerate(articles[:max_articles], 1):
        title = a.get("title", "")
        desc = a.get("description", "") or ""
        source = a.get("source", "")
        article_texts.append(f"{i}. [{source}] {title}\n   {desc[:200]}")

    articles_block = "\n".join(article_texts)

    industry_hint = f"산업 분야: {industry}" if industry else ""

    prompt = (
        f"다음은 오늘의 주요 뉴스 {len(articles)}건입니다.\n"
        f"{industry_hint}\n\n"
        f"{articles_block}\n\n"
        "위 뉴스를 분석하여 경영진 브리핑 보고서를 작성하세요.\n\n"
        "반드시 아래 JSON 형식으로 출력:\n"
        "{\n"
        '  "summary": "전체 요약 (3-5문장)",\n'
        '  "key_trends": ["트렌드1", "트렌드2", "트렌드3"],\n'
        '  "opportunities": ["기회1", "기회2"],\n'
        '  "risks": ["리스크1", "리스크2"],\n'
        '  "action_items": ["조치사항1", "조치사항2"],\n'
        '  "sentiment": "positive | neutral | negative"\n'
        "}\n"
        "JSON만 출력하세요."
    )

    provider = AIProvider()
    response = provider.chat(
        messages=[{"role": "user", "content": prompt}],
        system="당신은 한국 대기업 그룹의 전략기획실 수석 애널리스트입니다. "
               "뉴스를 분석해 경영진이 빠르게 의사결정할 수 있는 브리핑을 작성합니다. "
               "반드시 JSON만 출력하세요.",
        session_type="briefing",
        agent_name="NewsAnalyst",
        company_id=company_id or 0,
    )

    briefing = None
    try:
        raw = response.strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            briefing = _json.loads(raw[start:end + 1])
    except Exception as e:
        logger.warning(f"[News] 브리핑 JSON 파싱 실패: {e}")
        briefing = {"summary": response, "parse_error": True}

    # 3) DB에 수집 데이터 저장
    _save_collected_news(db, articles, query or industry, company_id)

    return {
        "industry": industry,
        "query": query,
        "article_count": len(articles),
        "source": news_result.get("source", ""),
        "briefing": briefing,
        "articles": articles,
    }


def get_news_categories() -> List[Dict[str, str]]:
    """지원하는 뉴스 카테고리 목록."""
    return [
        {"id": c, "label": c.capitalize()}
        for c in NEWSAPI_CATEGORIES
    ]


def get_industry_list() -> List[Dict[str, Any]]:
    """지원하는 산업 목록 + 키워드."""
    return [
        {"industry": k, "keywords": v}
        for k, v in INDUSTRY_KEYWORDS.items()
    ]


# ── Internal Helpers ─────────────────────────────────────────────────────────

def _fallback_google_rss(query: str) -> tuple:
    """Google News RSS 폴백."""
    try:
        import httpx
        from urllib.parse import quote
        import xml.etree.ElementTree as ET

        rss_url = f"https://news.google.com/rss/search?q={quote(query)}&hl=ko&gl=KR&ceid=KR:ko"
        resp = httpx.get(rss_url, timeout=10.0)
        root = ET.fromstring(resp.text)
        items = root.findall(".//item")[:10]
        results = [
            {
                "title": (item.findtext("title") or "").strip(),
                "description": (item.findtext("description") or "").strip()[:300],
                "url": (item.findtext("link") or "").strip(),
                "image": "",
                "source": (item.findtext("source") or "").strip(),
                "author": "",
                "published_at": (item.findtext("pubDate") or "").strip(),
            }
            for item in items
        ]
        return results, "google_news_rss"
    except Exception as e:
        logger.warning(f"[News] RSS 폴백도 실패: {e}")
        return [], "none"


def _update_last_used(db: Session, key_row) -> None:
    """API 키 마지막 사용 시간 갱신."""
    try:
        key_row.last_used_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()


def _save_collected_news(
    db: Session,
    articles: List[Dict],
    query: str,
    company_id: Optional[int],
) -> None:
    """수집한 뉴스를 CollectedData 테이블에 저장."""
    try:
        from models.models import CollectedData
        import hashlib, json as _json

        for article in articles[:20]:
            content = article.get("description", "") or article.get("title", "")
            content_hash = hashlib.sha256(content.encode()).hexdigest()

            # 중복 방지
            exists = db.query(CollectedData).filter(
                CollectedData.content_hash == content_hash
            ).first()
            if exists:
                continue

            item = CollectedData(
                company_id=company_id,
                data_type="news",
                source=article.get("source", "newsapi"),
                query=query,
                title=article.get("title", ""),
                content=content,
                structured=article,
                tags=[query] if query else [],
                status="raw",
                content_hash=content_hash,
            )
            db.add(item)
        db.commit()
    except Exception as e:
        logger.warning(f"[News] CollectedData 저장 실패: {e}")
        db.rollback()
