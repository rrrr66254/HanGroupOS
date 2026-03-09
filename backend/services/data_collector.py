"""
Data Collection Service
웹 검색, 뉴스, RSS, 스크래핑, 무역 데이터 수집

지원 소스:
  - SerpAPI      : Google 웹 검색 (API 키 필요, 무료 100회/월)
  - NewsAPI      : 뉴스 기사 (API 키 필요, 무료 100회/일)
  - Google News RSS : 뉴스 검색 (무료, 키 불필요)
  - UN Comtrade  : 국제 무역 통계 (무료, API 키 선택)
  - Web Scraping : 임의 URL 스크래핑 (무료)
  - RSS/Atom     : 임의 피드 파싱 (무료)
"""
import httpx
import json
import re
from typing import Optional, List, Dict, Any
from datetime import datetime

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

try:
    import feedparser
    FEEDPARSER_AVAILABLE = True
except ImportError:
    FEEDPARSER_AVAILABLE = False


# 서비스별 필요 키 정보 (UI에 안내용)
SERVICE_INFO = {
    "serpapi": {
        "name": "SerpAPI",
        "description": "Google 웹 검색 결과 수집",
        "url": "https://serpapi.com/",
        "free_tier": "무료 100회/월",
        "required_fields": ["api_key"],
        "optional_fields": [],
    },
    "newsapi": {
        "name": "NewsAPI",
        "description": "전세계 뉴스 기사 수집",
        "url": "https://newsapi.org/",
        "free_tier": "무료 100회/일 (개인용)",
        "required_fields": ["api_key"],
        "optional_fields": [],
    },
    "comtrade": {
        "name": "UN Comtrade",
        "description": "UN 국제 무역 통계 (수출입 데이터)",
        "url": "https://comtradeplus.un.org/",
        "free_tier": "무료 (1일 500회)",
        "required_fields": [],
        "optional_fields": ["api_key"],
    },
}


class DataCollector:
    def __init__(self, api_keys: Dict[str, str] = None, extra_configs: Dict[str, Dict] = None):
        self.api_keys = api_keys or {}
        self.extra_configs = extra_configs or {}

    # ── Web Search ────────────────────────────────────────────────────────────
    def web_search(self, query: str, num_results: int = 10,
                   country: str = "kr", language: str = "ko") -> Dict[str, Any]:
        """
        웹 검색.
        SerpAPI 키가 있으면 Google 검색, 없으면 Google News RSS 활용.
        """
        serpapi_key = self.api_keys.get("serpapi")
        if serpapi_key:
            return self._serpapi_search(query, num_results, serpapi_key, country, language)
        else:
            return {
                "query": query,
                "results": [],
                "requires_key": True,
                "service": "serpapi",
                "message": "🔑 SerpAPI 키가 없습니다. 관리자 > 외부 API 키 설정에서 SerpAPI 키를 등록하면 Google 검색 결과를 수집할 수 있습니다.",
                "signup_url": "https://serpapi.com/",
                "free_tier": "무료 100회/월",
            }

    def _serpapi_search(self, query: str, num_results: int, api_key: str,
                        country: str, language: str) -> Dict[str, Any]:
        try:
            url = "https://serpapi.com/search"
            params = {
                "q": query,
                "api_key": api_key,
                "num": min(num_results, 100),
                "hl": language,
                "gl": country,
            }
            with httpx.Client(timeout=30) as client:
                r = client.get(url, params=params)
                r.raise_for_status()
                data = r.json()

            results = []
            for item in data.get("organic_results", []):
                results.append({
                    "title": item.get("title", ""),
                    "url": item.get("link", ""),
                    "snippet": item.get("snippet", ""),
                    "source": item.get("displayed_link", ""),
                    "position": item.get("position"),
                })

            return {
                "query": query,
                "results": results,
                "total": len(results),
                "source": "serpapi",
                "search_metadata": data.get("search_metadata", {}),
            }
        except Exception as e:
            return {"query": query, "results": [], "error": str(e), "source": "serpapi"}

    # ── News Search ───────────────────────────────────────────────────────────
    def news_search(self, query: str, language: str = "ko",
                    days_back: int = 7) -> Dict[str, Any]:
        """
        뉴스 검색.
        NewsAPI 키가 있으면 NewsAPI 사용, 없으면 Google News RSS (무료).
        """
        newsapi_key = self.api_keys.get("newsapi")
        if newsapi_key:
            return self._newsapi_search(query, language, newsapi_key, days_back)
        else:
            # 무료 대안: Google News RSS
            result = self._google_news_rss(query, language)
            result["message"] = (
                "💡 NewsAPI 키를 등록하면 더 많은 뉴스와 전문 내용을 수집할 수 있습니다. "
                "현재는 Google News RSS(무료)를 사용 중입니다."
            )
            return result

    def _newsapi_search(self, query: str, language: str, api_key: str,
                        days_back: int) -> Dict[str, Any]:
        try:
            from datetime import timedelta
            from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
            url = "https://newsapi.org/v2/everything"
            params = {
                "q": query,
                "language": language,
                "sortBy": "publishedAt",
                "pageSize": 30,
                "from": from_date,
                "apiKey": api_key,
            }
            with httpx.Client(timeout=30) as client:
                r = client.get(url, params=params)
                r.raise_for_status()
                data = r.json()

            articles = []
            for a in data.get("articles", []):
                articles.append({
                    "title": a.get("title", ""),
                    "description": a.get("description", ""),
                    "url": a.get("url", ""),
                    "source": a.get("source", {}).get("name", ""),
                    "published_at": a.get("publishedAt", ""),
                    "content": a.get("content", ""),
                    "author": a.get("author", ""),
                })
            return {
                "query": query,
                "articles": articles,
                "total": data.get("totalResults", len(articles)),
                "source": "newsapi",
            }
        except Exception as e:
            return {"query": query, "articles": [], "error": str(e), "source": "newsapi"}

    def _google_news_rss(self, query: str, language: str = "ko") -> Dict[str, Any]:
        """Google News RSS 피드 (무료, API 키 불필요)."""
        if not FEEDPARSER_AVAILABLE:
            return {"query": query, "articles": [], "error": "feedparser 미설치. pip install feedparser"}

        lang_map = {"ko": "ko&gl=KR&ceid=KR:ko", "en": "en&gl=US&ceid=US:en"}
        lang_param = lang_map.get(language, "ko&gl=KR&ceid=KR:ko")
        url = f"https://news.google.com/rss/search?q={query}&hl={lang_param}"

        try:
            feed = feedparser.parse(url)
            articles = []
            for entry in feed.entries[:30]:
                articles.append({
                    "title": entry.get("title", ""),
                    "url": entry.get("link", ""),
                    "source": getattr(entry, "source", {}).get("title", "") if hasattr(entry, "source") else "",
                    "published_at": entry.get("published", ""),
                    "description": self._strip_html(entry.get("summary", "")),
                })
            return {
                "query": query,
                "articles": articles,
                "total": len(articles),
                "source": "google_news_rss_free",
            }
        except Exception as e:
            return {"query": query, "articles": [], "error": str(e), "source": "google_news_rss"}

    # ── Web Scraping ──────────────────────────────────────────────────────────
    def scrape_url(self, url: str) -> Dict[str, Any]:
        """특정 URL의 내용 스크래핑."""
        if not BS4_AVAILABLE:
            return {"url": url, "error": "beautifulsoup4 미설치. pip install beautifulsoup4 lxml"}

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        }
        try:
            with httpx.Client(timeout=30, follow_redirects=True) as client:
                r = client.get(url, headers=headers)
                r.raise_for_status()

            soup = BeautifulSoup(r.text, "lxml")

            # 불필요한 태그 제거
            for tag in soup(["script", "style", "nav", "footer", "header",
                              "aside", "iframe", "noscript", "form"]):
                tag.decompose()

            title = soup.find("title")
            title_text = title.get_text(strip=True) if title else ""

            meta_desc = soup.find("meta", {"name": "description"})
            description = meta_desc.get("content", "") if meta_desc else ""

            # 본문 추출
            main = (soup.find("article") or soup.find("main") or
                    soup.find(id=re.compile(r"content|main|article", re.I)) or
                    soup.find("body"))
            text = main.get_text(separator="\n", strip=True) if main else r.text[:5000]

            # 링크 추출
            links = []
            for a in soup.find_all("a", href=True)[:20]:
                href = a.get("href", "")
                if href.startswith("http"):
                    links.append({"text": a.get_text(strip=True)[:100], "url": href})

            return {
                "url": url,
                "title": title_text,
                "description": description,
                "content": text[:10000],
                "content_length": len(text),
                "links": links,
                "status_code": r.status_code,
            }
        except Exception as e:
            return {"url": url, "error": str(e), "content": ""}

    # ── RSS/Atom Feed ─────────────────────────────────────────────────────────
    def fetch_rss(self, feed_url: str) -> Dict[str, Any]:
        """RSS/Atom 피드 파싱."""
        if not FEEDPARSER_AVAILABLE:
            return {"feed_url": feed_url, "error": "feedparser 미설치. pip install feedparser"}
        try:
            feed = feedparser.parse(feed_url)
            entries = []
            for entry in feed.entries[:50]:
                entries.append({
                    "title": entry.get("title", ""),
                    "url": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "summary": self._strip_html(entry.get("summary", ""))[:500],
                    "author": entry.get("author", ""),
                    "tags": [t.get("term", "") for t in entry.get("tags", [])],
                })
            return {
                "feed_title": feed.feed.get("title", ""),
                "feed_description": feed.feed.get("description", ""),
                "feed_url": feed_url,
                "entries": entries,
                "total": len(entries),
            }
        except Exception as e:
            return {"feed_url": feed_url, "entries": [], "error": str(e)}

    # ── UN Comtrade Trade Data ─────────────────────────────────────────────────
    def fetch_comtrade(self, reporter_code: str, partner_code: str = "0",
                       commodity_code: str = "TOTAL", year: str = "2023",
                       trade_flow: str = "X") -> Dict[str, Any]:
        """
        UN Comtrade 무역 데이터 수집.
        reporter_code: 보고국 코드 (예: 410=한국, 156=중국, 840=미국)
        partner_code: 상대국 코드 (0=전세계)
        trade_flow: X=수출, M=수입
        무료 사용 가능 (1일 500회 제한).
        """
        comtrade_key = self.api_keys.get("comtrade", "")
        url = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
        params = {
            "reporterCode": reporter_code,
            "partnerCode": partner_code,
            "cmdCode": commodity_code,
            "period": year,
            "motCode": "0",
            "flowCode": trade_flow,
        }
        if comtrade_key:
            params["subscription-key"] = comtrade_key

        try:
            with httpx.Client(timeout=30) as client:
                r = client.get(url, params=params)
                if r.status_code == 200:
                    data = r.json()
                    return {
                        "reporter_code": reporter_code,
                        "partner_code": partner_code,
                        "commodity_code": commodity_code,
                        "year": year,
                        "trade_flow": trade_flow,
                        "data": data.get("data", []),
                        "total_records": len(data.get("data", [])),
                        "source": "un_comtrade",
                    }
                else:
                    return {
                        "error": f"Comtrade API 응답 오류 (HTTP {r.status_code})",
                        "detail": r.text[:500],
                        "source": "un_comtrade",
                    }
        except Exception as e:
            return {"error": str(e), "source": "un_comtrade"}

    # ── Utility ───────────────────────────────────────────────────────────────
    @staticmethod
    def _strip_html(text: str) -> str:
        """HTML 태그 제거."""
        return re.sub(r"<[^>]+>", "", text or "").strip()

    @staticmethod
    def get_required_keys_info() -> Dict[str, Any]:
        """어떤 서비스에 어떤 키가 필요한지 안내 정보 반환."""
        return SERVICE_INFO
