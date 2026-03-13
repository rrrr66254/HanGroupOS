"""
게임 플랫폼 서비스
==================
- 트렌딩 게임 검색 (SerpAPI 또는 RSS 폴백)
- 게임 메트릭/분석 수집
- AI 게임 아이디어 생성
- 한국 게임 사업 필수 허가 목록
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from core.logging import get_logger

logger = get_logger("service.game_platform")


def search_trending_games(
    db: Session,
    query: str = "",
    platform: str = "all",
) -> Dict[str, Any]:
    """
    SerpAPI로 Steam/Itch.io 트렌딩 게임 검색.
    SerpAPI 키가 없으면 Google News RSS로 폴백.
    """
    from core.utils import get_active_api_key

    serpapi_key_row = get_active_api_key(db, "serpapi")

    platform_queries = {
        "steam": f"site:store.steampowered.com top selling games 2026 {query}".strip(),
        "itch":  f"site:itch.io trending games 2026 {query}".strip(),
        "all":   f"best new indie games trending 2026 {query}".strip(),
    }
    search_query = platform_queries.get(platform, platform_queries["all"])

    results = []
    source_used = "none"

    if serpapi_key_row:
        try:
            import httpx
            resp = httpx.get(
                "https://serpapi.com/search",
                params={
                    "q": search_query,
                    "api_key": serpapi_key_row.api_key,
                    "num": 10,
                    "hl": "ko",
                },
                timeout=15.0,
            )
            data = resp.json()
            organic = data.get("organic_results", [])
            results = [
                {
                    "title": r.get("title", ""),
                    "link": r.get("link", ""),
                    "snippet": r.get("snippet", ""),
                    "source": "serpapi",
                }
                for r in organic[:10]
            ]
            source_used = "serpapi"
        except Exception as e:
            logger.warning("[GamePlatform] SerpAPI 실패, RSS 폴백: {e}")

    if not results:
        # 무료 대체: Google News RSS
        try:
            import httpx
            from urllib.parse import quote
            rss_url = f"https://news.google.com/rss/search?q={quote(search_query)}&hl=ko"
            resp = httpx.get(rss_url, timeout=10.0)
            # 간단한 XML 파싱
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.text)
            items = root.findall(".//item")[:10]
            results = [
                {
                    "title": (item.findtext("title") or "").strip(),
                    "link": (item.findtext("link") or "").strip(),
                    "snippet": (item.findtext("description") or "").strip()[:200],
                    "source": "google_news_rss",
                }
                for item in items
            ]
            source_used = "google_news_rss"
        except Exception as e:
            logger.warning("[GamePlatform] RSS 폴백도 실패: {e}")

    return {
        "query": search_query,
        "platform": platform,
        "source": source_used,
        "count": len(results),
        "results": results,
    }


def get_game_analytics(game_title: str, db: Session) -> Dict[str, Any]:
    """
    게임 메트릭 수집: SerpAPI로 Steam/Itch.io 리뷰·다운로드 정보 검색.
    """
    from core.utils import get_active_api_key

    serpapi_key_row = get_active_api_key(db, "serpapi")

    results = {}

    if serpapi_key_row:
        try:
            import httpx
            queries = [
                f"{game_title} steam reviews players",
                f"{game_title} itch.io downloads rating",
            ]
            all_snippets = []
            for q in queries:
                resp = httpx.get(
                    "https://serpapi.com/search",
                    params={"q": q, "api_key": serpapi_key_row.api_key, "num": 5},
                    timeout=15.0,
                )
                data = resp.json()
                for r in data.get("organic_results", [])[:3]:
                    all_snippets.append({
                        "title": r.get("title", ""),
                        "snippet": r.get("snippet", ""),
                        "link": r.get("link", ""),
                    })
            results["raw_data"] = all_snippets
            results["source"] = "serpapi"
        except Exception as e:
            logger.warning("[GamePlatform] 게임 분석 SerpAPI 실패: {e}")
            results["source"] = "unavailable"
            results["error"] = str(e)
    else:
        results["source"] = "no_serpapi_key"
        results["message"] = "SerpAPI 키를 등록하면 게임 메트릭 수집이 가능합니다."

    results["game_title"] = game_title
    return results


def generate_game_idea(
    db: Session,
    trends: Optional[List[Dict]] = None,
    genre: str = "",
    platform: str = "",
    count: int = 3,
) -> Dict[str, Any]:
    """
    트렌드 데이터 + AI로 신규 게임 아이디어 생성.
    """
    from services.ai_provider import AIProvider
    import json as _json

    trend_text = ""
    if trends:
        trend_items = []
        for t in trends[:5]:
            title = t.get("title", "")
            snippet = t.get("snippet", "")
            if title:
                trend_items.append(f"- {title}: {snippet[:100]}")
        trend_text = "\n".join(trend_items)

    genre_hint = f"장르: {genre}" if genre else "장르: 자유"
    platform_hint = f"플랫폼: {platform}" if platform else "플랫폼: 자유"

    prompt = (
        f"게임 개발 회사의 신규 게임 아이디어를 {count}개 생성하세요.\n\n"
        f"{genre_hint}\n{platform_hint}\n"
    )
    if trend_text:
        prompt += f"\n현재 트렌드 참고:\n{trend_text}\n"

    prompt += (
        "\n각 아이디어를 다음 JSON 배열 형식으로 출력하세요:\n"
        "[\n"
        '  {"title": "게임명", "genre": "장르", "platform": "플랫폼",\n'
        '   "concept": "핵심 콘셉트 설명", "target_audience": "타깃 유저",\n'
        '   "unique_selling_point": "차별화 포인트", "monetization": "수익 모델",\n'
        '   "development_estimate": "개발 규모 추정"},\n'
        "  ...\n"
        "]\n"
        "JSON만 출력하세요."
    )

    provider = AIProvider()
    response = provider.chat(
        messages=[{"role": "user", "content": prompt}],
        system="당신은 창의적인 게임 기획자입니다. JSON만 출력하세요.",
    )

    ideas = []
    try:
        raw = response.strip()
        start = raw.find("[")
        end = raw.rfind("]")
        if start != -1 and end != -1:
            ideas = _json.loads(raw[start:end + 1])
    except Exception as e:
        logger.warning("[GamePlatform] 아이디어 JSON 파싱 실패: {e}")
        ideas = [{"title": "파싱 실패", "raw_response": response}]

    return {
        "genre": genre,
        "platform": platform,
        "count": len(ideas),
        "ideas": ideas,
    }


def get_required_permits(country: str = "KR") -> List[Dict[str, str]]:
    """게임 서비스에 필요한 법적 허가 목록 반환."""
    permits_by_country = {
        "KR": [
            {
                "name": "게임물관리위원회 등급분류",
                "authority": "게임물관리위원회 (GRAC)",
                "description": "게임 서비스 전 의무 등급분류 심사 (전체이용가/12세/15세/청불)",
                "url": "https://www.grac.or.kr",
                "required": True,
            },
            {
                "name": "정보통신망법 준수",
                "authority": "방송통신위원회",
                "description": "온라인 게임 서비스 시 개인정보 처리방침 및 청소년 보호 의무",
                "url": "https://www.kcc.go.kr",
                "required": True,
            },
            {
                "name": "개인정보처리방침 등록",
                "authority": "개인정보보호위원회",
                "description": "회원가입/결제 등 개인정보 수집 시 방침 공개 및 동의 절차 필요",
                "url": "https://www.pipc.go.kr",
                "required": True,
            },
            {
                "name": "게임산업진흥법 준수",
                "authority": "문화체육관광부",
                "description": "확률형 아이템 공개, 과도한 사행 요소 금지 등",
                "url": "https://www.mcst.go.kr",
                "required": True,
            },
            {
                "name": "전자금융거래법 (인앱결제)",
                "authority": "금융위원회",
                "description": "인앱 결제 또는 가상화폐 거래 시 전자금융업 등록 필요",
                "url": "https://www.fsc.go.kr",
                "required": False,
            },
        ],
        "US": [
            {
                "name": "ESRB Rating",
                "authority": "Entertainment Software Rating Board",
                "description": "미국 게임 등급 분류 (E/E10+/T/M/AO)",
                "url": "https://www.esrb.org",
                "required": False,
            },
            {
                "name": "COPPA Compliance",
                "authority": "FTC",
                "description": "13세 미만 대상 게임 시 아동 개인정보 보호법 준수 의무",
                "url": "https://www.ftc.gov/coppa",
                "required": True,
            },
        ],
    }
    return permits_by_country.get(country.upper(), permits_by_country["KR"])
