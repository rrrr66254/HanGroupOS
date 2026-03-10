"""
Data Collection Service
웹 검색, 뉴스, RSS, 스크래핑, 무역/경제 데이터 수집

지원 소스 (무료, 키 불필요):
  - Google News RSS : 뉴스 검색
  - HackerNews API  : 글로벌 테크 트렌드 (top 스토리)
  - World Bank API  : 190개국 거시경제 지표 (GDP, 무역 등)
  - Reddit API      : 서브레딧 인기 게시글
  - UN Comtrade     : 국제 무역 통계 (1일 500회)
  - Web Scraping    : 임의 URL 스크래핑
  - RSS/Atom        : 임의 피드 파싱

지원 소스 (무료 키 필요):
  - SerpAPI         : Google 웹 검색 (100회/월)
  - NewsAPI         : 뉴스 기사 (100회/일)
  - DART (금융감독원): 한국 상장사 공시 정보
  - ECOS (한국은행) : 금리·환율·물가 등 경제통계
  - FRED (미국 연준): 미국/글로벌 경제 지표
  - Alpha Vantage   : 주가·환율 데이터 (분당 5회)
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
    # ── 키 필요 ──────────────────────────────────────────────────────────────
    "serpapi": {
        "name": "SerpAPI",
        "description": "Google 웹 검색 결과 수집",
        "url": "https://serpapi.com/",
        "free_tier": "무료 100회/월",
        "required_fields": ["api_key"],
        "optional_fields": [],
        "key_required": True,
    },
    "newsapi": {
        "name": "NewsAPI",
        "description": "전세계 뉴스 기사 수집",
        "url": "https://newsapi.org/",
        "free_tier": "무료 100회/일 (개인용)",
        "required_fields": ["api_key"],
        "optional_fields": [],
        "key_required": True,
    },
    "comtrade": {
        "name": "UN Comtrade",
        "description": "UN 국제 무역 통계 (수출입 데이터)",
        "url": "https://comtradeplus.un.org/",
        "free_tier": "무료 (1일 500회)",
        "required_fields": [],
        "optional_fields": ["api_key"],
        "key_required": False,
    },
    "dart": {
        "name": "DART (금융감독원)",
        "description": "한국 상장사 공시 정보 (사업보고서·주요사항 등)",
        "url": "https://opendart.fss.or.kr/",
        "free_tier": "무료 (회원가입 후 즉시 발급)",
        "required_fields": ["api_key"],
        "optional_fields": [],
        "key_required": True,
    },
    "ecos": {
        "name": "ECOS (한국은행 경제통계)",
        "description": "금리·환율·GDP·물가 등 거시경제 통계",
        "url": "https://ecos.bok.or.kr/",
        "free_tier": "무료 (회원가입 후 즉시 발급)",
        "required_fields": ["api_key"],
        "optional_fields": [],
        "key_required": True,
    },
    "fred": {
        "name": "FRED (미국 연방준비은행)",
        "description": "미국/글로벌 금리·환율·인플레이션 지표",
        "url": "https://fred.stlouisfed.org/docs/api/api_key.html",
        "free_tier": "완전 무료 (이메일 인증만 필요)",
        "required_fields": ["api_key"],
        "optional_fields": [],
        "key_required": True,
    },
    "alphavantage": {
        "name": "Alpha Vantage",
        "description": "주가·환율·암호화폐 실시간 및 과거 데이터",
        "url": "https://www.alphavantage.co/support/#api-key",
        "free_tier": "무료 (분당 5회, 일 500회)",
        "required_fields": ["api_key"],
        "optional_fields": [],
        "key_required": True,
    },
    # ── 키 불필요 (완전 무료) ─────────────────────────────────────────────────
    "hackernews": {
        "name": "HackerNews",
        "description": "글로벌 테크 트렌드 및 스타트업 동향 (키 불필요)",
        "url": "https://hacker-news.firebaseio.com/",
        "free_tier": "완전 무료, 키 불필요",
        "required_fields": [],
        "optional_fields": [],
        "key_required": False,
    },
    "worldbank": {
        "name": "World Bank Open Data",
        "description": "190개국 GDP·무역·인구 등 거시경제 지표 (키 불필요)",
        "url": "https://data.worldbank.org/",
        "free_tier": "완전 무료, 키 불필요",
        "required_fields": [],
        "optional_fields": [],
        "key_required": False,
    },
    "reddit": {
        "name": "Reddit",
        "description": "기술·스타트업·산업별 커뮤니티 트렌드 (키 불필요)",
        "url": "https://www.reddit.com/",
        "free_tier": "완전 무료, 키 불필요",
        "required_fields": [],
        "optional_fields": [],
        "key_required": False,
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

    # ── HackerNews ────────────────────────────────────────────────────────────
    def collect_hackernews(self, limit: int = 15) -> Dict[str, Any]:
        """HackerNews 상위 스토리 수집 (완전 무료, API 키 불필요)."""
        base = "https://hacker-news.firebaseio.com/v0"
        try:
            with httpx.Client(timeout=15) as client:
                top_ids = client.get(f"{base}/topstories.json").json()
                stories = []
                for sid in top_ids[:limit]:
                    try:
                        item = client.get(f"{base}/item/{sid}.json", timeout=5).json()
                        if item and item.get("type") == "story" and item.get("title"):
                            stories.append({
                                "title": item.get("title", ""),
                                "url": item.get("url", f"https://news.ycombinator.com/item?id={sid}"),
                                "score": item.get("score", 0),
                                "comments": item.get("descendants", 0),
                                "author": item.get("by", ""),
                                "published_at": (
                                    datetime.fromtimestamp(item["time"]).isoformat()
                                    if item.get("time") else ""
                                ),
                            })
                    except Exception:
                        continue
            return {"source": "hackernews", "stories": stories, "total": len(stories)}
        except Exception as e:
            return {"source": "hackernews", "stories": [], "error": str(e)}

    # ── World Bank ────────────────────────────────────────────────────────────
    def collect_worldbank(self, indicator: str = "NY.GDP.MKTP.KD.ZG",
                          country: str = "KR") -> Dict[str, Any]:
        """
        World Bank 거시경제 지표 수집 (완전 무료, 키 불필요).
        주요 지표:
          NY.GDP.MKTP.KD.ZG — GDP 성장률
          NE.EXP.GNFS.ZS   — 수출 (GDP 대비 %)
          FP.CPI.TOTL.ZG    — 소비자물가지수 상승률
          BX.KLT.DINV.WD.GD.ZS — 외국인직접투자 (GDP 대비 %)
        """
        url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
        try:
            with httpx.Client(timeout=15) as client:
                r = client.get(url, params={"format": "json", "mrv": 10, "per_page": 10})
                r.raise_for_status()
                data = r.json()
            records = data[1] if len(data) > 1 and data[1] else []
            results = [
                {
                    "indicator": indicator,
                    "country": rec.get("country", {}).get("value", country),
                    "year": rec.get("date", ""),
                    "value": rec.get("value"),
                    "unit": "",
                }
                for rec in records if rec.get("value") is not None
            ]
            return {
                "source": "worldbank", "indicator": indicator,
                "country": country, "data": results, "total": len(results),
            }
        except Exception as e:
            return {"source": "worldbank", "indicator": indicator, "data": [], "error": str(e)}

    # ── Reddit ────────────────────────────────────────────────────────────────
    def collect_reddit(self, subreddit: str = "technology",
                       limit: int = 20) -> Dict[str, Any]:
        """Reddit 서브레딧 인기 게시글 수집 (무료, 키 불필요)."""
        url = f"https://www.reddit.com/r/{subreddit}/hot.json"
        headers = {
            "User-Agent": "HAN-GroupOS-DataCollector/1.0",
            "Accept": "application/json",
        }
        try:
            with httpx.Client(timeout=15, follow_redirects=True) as client:
                r = client.get(url, headers=headers, params={"limit": min(limit, 25)})
                r.raise_for_status()
                data = r.json()
            posts = []
            for child in data.get("data", {}).get("children", []):
                post = child.get("data", {})
                posts.append({
                    "title": post.get("title", ""),
                    "url": post.get("url", ""),
                    "permalink": f"https://reddit.com{post.get('permalink', '')}",
                    "score": post.get("score", 0),
                    "comments": post.get("num_comments", 0),
                    "subreddit": post.get("subreddit", subreddit),
                    "author": post.get("author", ""),
                    "published_at": (
                        datetime.fromtimestamp(post["created_utc"]).isoformat()
                        if post.get("created_utc") else ""
                    ),
                    "summary": post.get("selftext", "")[:300],
                })
            return {"source": "reddit", "subreddit": subreddit, "posts": posts, "total": len(posts)}
        except Exception as e:
            return {"source": "reddit", "subreddit": subreddit, "posts": [], "error": str(e)}

    # ── DART (금융감독원) ──────────────────────────────────────────────────────
    def collect_dart(self, company_name: str = "", days_back: int = 7) -> Dict[str, Any]:
        """DART 금융감독원 공시 수집 (무료 키 필요 — opendart.fss.or.kr)."""
        dart_key = self.api_keys.get("dart")
        if not dart_key:
            return {
                "source": "dart", "disclosures": [], "requires_key": True,
                "message": "🔑 DART API 키를 등록하세요 (관리자 > 외부 API 키).",
                "signup_url": "https://opendart.fss.or.kr/",
                "free_tier": "무료 (회원가입 후 즉시 발급)",
            }
        from datetime import timedelta
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=days_back)
        params = {
            "crtfc_key": dart_key,
            "bgn_de": start_dt.strftime("%Y%m%d"),
            "end_de": end_dt.strftime("%Y%m%d"),
            "sort": "date", "sort_mth": "desc", "page_count": "20",
        }
        if company_name:
            params["corp_name"] = company_name
        try:
            with httpx.Client(timeout=15) as client:
                r = client.get("https://opendart.fss.or.kr/api/list.json", params=params)
                r.raise_for_status()
                data = r.json()
            if data.get("status") != "000":
                return {"source": "dart", "disclosures": [], "error": data.get("message", "API 오류")}
            disclosures = [
                {
                    "title": item.get("report_nm", ""),
                    "company": item.get("corp_name", ""),
                    "date": item.get("rcept_dt", ""),
                    "type": item.get("pblntf_detail_ty", ""),
                    "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={item.get('rcept_no','')}",
                }
                for item in data.get("list", [])
            ]
            return {"source": "dart", "disclosures": disclosures, "total": len(disclosures),
                    "query": company_name}
        except Exception as e:
            return {"source": "dart", "disclosures": [], "error": str(e)}

    # ── ECOS (한국은행) ────────────────────────────────────────────────────────
    def collect_ecos(self, stat_code: str = "722Y001",
                     item_code: str = "*AA", period_type: str = "M") -> Dict[str, Any]:
        """
        한국은행 ECOS 경제통계 수집 (무료 키 필요 — ecos.bok.or.kr).
        주요 stat_code:
          722Y001 — 기준금리
          731Y003 — 환율 (원/달러)
          901Y009 — 소비자물가지수
          200Y001 — 국내총생산 (GDP)
        """
        ecos_key = self.api_keys.get("ecos")
        if not ecos_key:
            return {
                "source": "ecos", "data": [], "requires_key": True,
                "message": "🔑 한국은행 ECOS API 키를 등록하세요 (관리자 > 외부 API 키).",
                "signup_url": "https://ecos.bok.or.kr/",
                "free_tier": "무료 (회원가입 후 즉시 발급)",
            }
        from datetime import timedelta
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=180)
        fmt = "%Y%m" if period_type == "M" else "%Y"
        url = (
            f"https://ecos.bok.or.kr/api/StatisticSearch/{ecos_key}/json/kr/1/100/"
            f"{stat_code}/{period_type}/{start_dt.strftime(fmt)}/{end_dt.strftime(fmt)}/{item_code}"
        )
        try:
            with httpx.Client(timeout=15) as client:
                r = client.get(url)
                r.raise_for_status()
                data = r.json()
            rows = data.get("StatisticSearch", {}).get("row", [])
            results = [
                {
                    "stat_code": row.get("STAT_CODE", stat_code),
                    "stat_name": row.get("STAT_NAME", ""),
                    "item_name": row.get("ITEM_NAME1", ""),
                    "period": row.get("TIME", ""),
                    "value": row.get("DATA_VALUE", ""),
                    "unit": row.get("UNIT_NAME", ""),
                }
                for row in rows
            ]
            return {"source": "ecos", "stat_code": stat_code, "data": results, "total": len(results)}
        except Exception as e:
            return {"source": "ecos", "data": [], "error": str(e)}

    # ── FRED (미국 연준) ───────────────────────────────────────────────────────
    def collect_fred(self, series_id: str = "DEXKOUS") -> Dict[str, Any]:
        """
        FRED 경제 지표 수집 (무료 키 필요 — fred.stlouisfed.org).
        주요 series_id:
          DEXKOUS — 원달러 환율
          DFF     — 미국 기준금리 (Federal Funds Rate)
          CPIAUCSL — 미국 CPI (소비자물가)
          GDP     — 미국 명목 GDP
        """
        fred_key = self.api_keys.get("fred")
        if not fred_key:
            return {
                "source": "fred", "data": [], "requires_key": True,
                "message": "🔑 FRED API 키를 등록하세요 (관리자 > 외부 API 키).",
                "signup_url": "https://fred.stlouisfed.org/docs/api/api_key.html",
                "free_tier": "완전 무료 (이메일 인증만 필요)",
            }
        from datetime import timedelta
        obs_start = (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%d")
        try:
            with httpx.Client(timeout=15) as client:
                r = client.get(
                    "https://api.stlouisfed.org/fred/series/observations",
                    params={
                        "series_id": series_id, "api_key": fred_key,
                        "file_type": "json", "sort_order": "desc",
                        "limit": 30, "observation_start": obs_start,
                    },
                )
                r.raise_for_status()
                data = r.json()
            results = [
                {"series_id": series_id, "date": obs.get("date", ""), "value": obs.get("value", "")}
                for obs in data.get("observations", [])
                if obs.get("value") != "."  # FRED uses "." for missing
            ]
            return {"source": "fred", "series_id": series_id, "data": results, "total": len(results)}
        except Exception as e:
            return {"source": "fred", "data": [], "error": str(e)}

    # ── Alpha Vantage ─────────────────────────────────────────────────────────
    def collect_alphavantage(self, symbol: str = "005930.KS",
                              function: str = "TIME_SERIES_DAILY") -> Dict[str, Any]:
        """
        Alpha Vantage 주가 데이터 수집 (무료 키 필요, 분당 5회 제한).
        symbol 예시: 005930.KS (삼성전자), AAPL (애플), MSFT (마이크로소프트)
        """
        av_key = self.api_keys.get("alphavantage")
        if not av_key:
            return {
                "source": "alphavantage", "data": [], "requires_key": True,
                "message": "🔑 Alpha Vantage API 키를 등록하세요 (관리자 > 외부 API 키).",
                "signup_url": "https://www.alphavantage.co/support/#api-key",
                "free_tier": "무료 (분당 5회, 일 500회)",
            }
        try:
            with httpx.Client(timeout=15) as client:
                r = client.get(
                    "https://www.alphavantage.co/query",
                    params={"function": function, "symbol": symbol,
                            "apikey": av_key, "outputsize": "compact"},
                )
                r.raise_for_status()
                data = r.json()
            if "Note" in data:
                return {"source": "alphavantage", "data": [], "error": "API 호출 한도 초과 (분당 5회)"}
            if "Error Message" in data:
                return {"source": "alphavantage", "data": [], "error": data["Error Message"]}
            ts_key = next((k for k in data if "Time Series" in k), None)
            if not ts_key:
                return {"source": "alphavantage", "data": [], "raw": data}
            results = [
                {
                    "date": date,
                    "open": vals.get("1. open", ""), "high": vals.get("2. high", ""),
                    "low": vals.get("3. low", ""), "close": vals.get("4. close", ""),
                    "volume": vals.get("5. volume", ""),
                }
                for date, vals in list(data[ts_key].items())[:30]
            ]
            return {"source": "alphavantage", "symbol": symbol, "data": results, "total": len(results)}
        except Exception as e:
            return {"source": "alphavantage", "symbol": symbol, "data": [], "error": str(e)}

    # ── Utility ───────────────────────────────────────────────────────────────
    @staticmethod
    def _strip_html(text: str) -> str:
        """HTML 태그 제거."""
        return re.sub(r"<[^>]+>", "", text or "").strip()

    @staticmethod
    def get_required_keys_info() -> Dict[str, Any]:
        """어떤 서비스에 어떤 키가 필요한지 안내 정보 반환."""
        return SERVICE_INFO
