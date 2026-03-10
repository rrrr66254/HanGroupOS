"""
AI Provider abstraction layer.
Supports: anthropic | openai | gemini | ollama | ktransformers | airllm
Ollama is the default local provider (no API key required).

저VRAM 옵션:
  ktransformers — CPU-GPU 하이브리드 (DeepSeek-R1: 24GB VRAM + RAM)
                  OpenAI 호환 서버 내장: http://localhost:30000/v1
  airllm        — 레이어별 스트리밍 (70B → 4GB VRAM, 속도 느림)
                  별도 서버 필요: python backend/airllm_server.py
"""
import json
from typing import Optional, List, Dict, Any
from core.config import settings


class AIProvider:
    def __init__(
        self,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.provider = provider or settings.DEFAULT_PROVIDER
        # Treat "mock" (legacy) as ollama
        if self.provider == "mock":
            self.provider = "ollama"

        self.api_key = api_key or self._get_default_key()
        self.model = model or self._get_default_model()
        self.base_url = base_url or ""

        # ktransformers / airllm: no API key needed (local servers)
        _local_providers = ("ollama", "ktransformers", "airllm")
        if not self.api_key and self.provider not in _local_providers:
            self.provider = "ollama"
            self.model = settings.OLLAMA_MODEL

    def _get_default_key(self) -> str:
        mapping = {
            "anthropic": settings.ANTHROPIC_API_KEY,
            "openai": settings.OPENAI_API_KEY,
            "gemini": settings.GEMINI_API_KEY,
        }
        return mapping.get(self.provider, "")

    def _get_default_model(self) -> str:
        mapping = {
            "anthropic": settings.ANTHROPIC_DEFAULT_MODEL,
            "openai": settings.OPENAI_DEFAULT_MODEL,
            "gemini": settings.GEMINI_DEFAULT_MODEL,
            "ollama": settings.OLLAMA_MODEL,
            "ktransformers": settings.KTRANSFORMERS_MODEL,
            "airllm": settings.AIRLLM_MODEL,
        }
        return mapping.get(self.provider, settings.OLLAMA_MODEL)

    def chat(
        self,
        messages: List[Dict[str, str]],
        system: str = "",
        session_type: str = "general",
        max_tokens: int = 1024,
    ) -> str:
        # ── Context Engineering: 토큰 최적화 (비용·속도 절감) ─────────────────
        try:
            from services.context_engineer import optimize as _ce_optimize
            max_ctx = getattr(settings, "CONTEXT_MAX_TOKENS", 6000)
            messages, system, _ctx_stats = _ce_optimize(
                messages, system, max_ctx, max_tokens
            )
        except Exception as _ce_err:
            pass  # CE 실패해도 원본으로 계속 진행
        # ─────────────────────────────────────────────────────────────────────

        try:
            if self.provider == "anthropic":
                return self._call_anthropic(messages, system, max_tokens)
            elif self.provider == "openai":
                return self._call_openai(messages, system, max_tokens)
            elif self.provider == "gemini":
                return self._call_gemini(messages, system, max_tokens)
            elif self.provider == "ktransformers":
                return self._call_openai_compat(
                    messages, system, max_tokens,
                    base_url=self.base_url or settings.KTRANSFORMERS_BASE_URL,
                    api_key=self.api_key or "ktransformers",
                    provider_name="KTransformers",
                )
            elif self.provider == "airllm":
                return self._call_openai_compat(
                    messages, system, max_tokens,
                    base_url=self.base_url or settings.AIRLLM_BASE_URL,
                    api_key=self.api_key or "airllm",
                    provider_name="AirLLM",
                )
            else:
                # Default: ollama
                return self._call_ollama(messages, system, max_tokens)
        except Exception as e:
            err = str(e)
            if "Connection" in err or "connect" in err.lower() or "ollama" in err.lower():
                return (
                    "⚠️ **Ollama 연결 실패**\n\n"
                    f"오류: {err}\n\n"
                    "Ollama가 실행 중인지 확인해주세요:\n"
                    "```\nollama serve\nollama pull qwen2.5\n```\n"
                    "관리자 > AI Provider 설정에서 Base URL을 입력해주세요.\n"
                    "예: `http://localhost:11434`"
                )
            return f"⚠️ AI 응답 오류: {err}"

    def _call_anthropic(
        self, messages: List[Dict], system: str, max_tokens: int
    ) -> str:
        import anthropic

        client = anthropic.Anthropic(api_key=self.api_key)
        response = client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system or "You are an AI executive assistant for HAN Group.",
            messages=messages,
        )
        return response.content[0].text

    def _call_openai(
        self, messages: List[Dict], system: str, max_tokens: int
    ) -> str:
        from openai import OpenAI

        client = OpenAI(api_key=self.api_key)
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)

        response = client.chat.completions.create(
            model=self.model,
            messages=full_messages,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    def _call_openai_compat(
        self,
        messages: List[Dict],
        system: str,
        max_tokens: int,
        base_url: str,
        api_key: str,
        provider_name: str = "Local",
    ) -> str:
        """
        OpenAI 호환 API를 사용하는 범용 메서드.
        KTransformers, AirLLM 등 OpenAI 호환 서버에 사용합니다.
        """
        from openai import OpenAI

        client = OpenAI(base_url=base_url, api_key=api_key)
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)

        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            err = str(e)
            if "connect" in err.lower() or "Connection" in err:
                if provider_name == "KTransformers":
                    hint = (
                        f"\n\n**KTransformers 서버를 시작하세요:**\n"
                        f"```\npip install ktransformers\n"
                        f"ktransformers --model {self.model} --port 30000\n```"
                    )
                else:
                    hint = (
                        f"\n\n**AirLLM 서버를 시작하세요:**\n"
                        f"```\npip install airllm bitsandbytes\n"
                        f"python backend/airllm_server.py --model {self.model} --port 11435\n```"
                    )
                raise ConnectionError(f"⚠️ {provider_name} 서버 연결 실패: {err}{hint}")
            raise

    def _call_gemini(
        self, messages: List[Dict], system: str, max_tokens: int
    ) -> str:
        import google.generativeai as genai

        genai.configure(api_key=self.api_key)
        gen_config = {"max_output_tokens": max_tokens}
        model = genai.GenerativeModel(
            self.model,
            system_instruction=system,
            generation_config=gen_config,
        )
        history = []
        for m in messages[:-1]:
            role = "user" if m["role"] == "user" else "model"
            history.append({"role": role, "parts": [m["content"]]})
        chat = model.start_chat(history=history)
        response = chat.send_message(messages[-1]["content"])
        return response.text

    def _call_ollama(
        self, messages: List[Dict], system: str, max_tokens: int
    ) -> str:
        import httpx

        base_url = self.base_url or settings.OLLAMA_BASE_URL
        if not base_url:
            base_url = "http://localhost:11434"

        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)

        response = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": self.model,
                "messages": full_messages,
                "stream": False,
                "options": {"num_predict": max_tokens},  # Ollama max tokens 수정
            },
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["message"]["content"]


def get_provider_from_db(db, user_id: int, provider_name: Optional[str] = None) -> AIProvider:
    """Load provider config from DB, fallback to env settings."""
    from models.models import ProviderConfig

    query = db.query(ProviderConfig).filter(
        ProviderConfig.user_id == user_id,
        ProviderConfig.is_active == True,
    )
    if provider_name:
        query = query.filter(ProviderConfig.provider == provider_name)

    config = query.first()
    if config and (config.api_key or config.provider == "ollama"):
        return AIProvider(
            provider=config.provider,
            api_key=config.api_key,
            model=config.model_override or None,
            base_url=config.base_url or None,
        )

    return AIProvider()


# ── System prompts ────────────────────────────────────────────────────────────
CHAIRMAN_SYSTEM = """당신은 한그룹(HAN Group)의 AI 회장입니다.
한그룹은 AI와 인간이 협력하여 새로운 기업 생태계를 만드는 그룹입니다.

역할:
- 그룹 전략 수립 및 최종 의사결정
- 신규 계열사 설립 검토 및 승인 (직접 실행 가능)
- 투자 및 사업 방향 결정
- 자원 배분 및 우선순위 설정
- Python 코드 작성·실행·디버깅 (직접 실행 가능)
- 데이터베이스 테이블 생성·저장·조회 (직접 실행 가능)

=== 실행 가능 액션 ===
당신은 아래 형식을 응답에 포함해 실제 시스템 액션을 실행할 수 있습니다.

【계열사 설립】
사용자가 회사/사업/계열사 설립을 요청하면, 반드시 아래 형식을 응답에 포함하세요:
<<CREATE_COMPANY:{"name":"회사명","industry":"산업분야","description":"사업 설명","vision":"비전"}>>

⚠️ 명명 규칙 (필수): 모든 계열사 이름은 반드시 "한"으로 시작해야 합니다.
예시: 한리서치, 한미디어, 한테크, 한파이낸스, 한에너지, 한헬스, 한에듀, 한로지스, 한클라우드

예시:
- 사용자: "AI 소프트웨어 회사 만들어"
  응답: "검토 결과 AI 분야 계열사 설립을 승인합니다. <<CREATE_COMPANY:{"name":"한인텔리전스","industry":"소프트웨어","description":"AI 기반 소프트웨어 서비스","vision":"AI로 세상을 혁신한다"}>>"

- 사용자: "데이터 사업 설립해줘"
  응답: "데이터 사업의 성장 가능성을 확인했습니다. <<CREATE_COMPANY:{"name":"한데이터","industry":"데이터","description":"데이터 분석 및 AI 플랫폼","vision":"데이터로 미래를 연다"}>>"

- 사용자: "미디어 계열사 만들어"
  응답: "미디어 사업 진출을 승인합니다. <<CREATE_COMPANY:{"name":"한미디어","industry":"미디어","description":"디지털 미디어 콘텐츠 플랫폼","vision":"콘텐츠로 세상을 연결한다"}>>"

중요: <<CREATE_COMPANY:...>> 형식이 응답에 포함되어야 실제로 시스템에 계열사가 생성됩니다.
이 형식 없이 "설립하겠습니다"라고만 말하면 아무것도 생성되지 않습니다.

【Python 코드 실행 — 직접 코딩 가능】
당신은 Python 코드를 직접 작성하고 실행할 수 있습니다.
코드가 실패하면 시스템이 자동으로 오류를 분석하고 당신에게 수정을 요청합니다. 성공할 때까지 반복합니다.

실행 형식:
<<EXECUTE_CODE:{"language":"python","code":"코드 내용","description":"작업 설명"}>>

사용 가능한 헬퍼 함수 (자동 주입):
  save_to_db(table, data, if_exists="append")  # list[dict] 데이터를 SQLite 테이블에 저장
  query_db(sql)                                 # SQL 실행 후 DataFrame 반환
  run_sql(sql)                                  # DDL/DML SQL 실행
  get_db()                                      # sqlite3.Connection 직접 반환
  WORKSPACE_DIR                                 # 파일 저장 경로
  WORKSPACE_DB                                  # SQLite DB 파일 경로

예시:
- 사용자: "수출입 데이터 수집해서 DB에 저장해줘"
  응답:
  <<INSTALL_PACKAGE:{"package":"requests pandas","description":"필요 라이브러리 설치"}>>
  데이터를 수집하고 저장하겠습니다.
  <<EXECUTE_CODE:{"language":"python","code":"import requests, pandas as pd\n# UN Comtrade API\nurl = 'https://comtradeapi.un.org/data/v1/...'\n...\nsave_to_db('trade_data', data)\nprint(f'저장 완료: {len(data)}행')","description":"수출입 데이터 수집 및 DB 저장"}>>

⚠️ 코드 실행 원칙:
1. 항상 진행 상황을 print()로 출력하세요 (저장 행 수, 오류 등).
2. 필요한 라이브러리는 <<INSTALL_PACKAGE:...>> 로 먼저 설치하세요.
3. 코드가 실패하면 오류 메시지를 분석하고 반드시 수정된 코드를 제출하세요.
4. DB 저장 시 save_to_db() 함수를 사용하면 pandas 없이도 자동 처리됩니다.
5. 데이터 수집 중간 진행 상황은 반드시 print()로 알려주세요.

【SQL 직접 실행 — DB 조회/생성/수정】
<<SQL_QUERY:{"query":"SQL 문장","description":"작업 설명"}>>

예시:
- 테이블 생성:
  <<SQL_QUERY:{"query":"CREATE TABLE IF NOT EXISTS trade_data (id INTEGER PRIMARY KEY, country TEXT, year INTEGER, value REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)","description":"무역 데이터 테이블 생성"}>>
- 데이터 조회:
  <<SQL_QUERY:{"query":"SELECT country, SUM(value) as total FROM trade_data GROUP BY country ORDER BY total DESC LIMIT 10","description":"국가별 무역 상위 10개"}>>

【pip 패키지 설치】
<<INSTALL_PACKAGE:{"package":"패키지명 패키지명2","description":"설치 이유"}>>

예시:
<<INSTALL_PACKAGE:{"package":"pandas requests beautifulsoup4 openpyxl","description":"데이터 수집 및 처리용"}>>

중요: 위 형식이 없으면 코드 실행/설치가 일어나지 않습니다. 실제 작업을 위해 반드시 형식을 포함하세요.

【외부 API 키 등록】
사용자가 API 키(SerpAPI, NewsAPI, WordPress, Tistory, YouTube 등)를 채팅에 입력하면
반드시 아래 형식을 응답에 포함해 즉시 저장하세요:
<<SAVE_API_KEY:{"service":"서비스명","api_key":"입력된키","label":"설명","extra_config":{}}>>

service 값: serpapi | newsapi | comtrade | wordpress | tistory | blogger | youtube

예시:
- 사용자: "SerpAPI 키 등록할게, 키는 abc123xyz야"
  응답: "SerpAPI 키를 등록하겠습니다. <<SAVE_API_KEY:{"service":"serpapi","api_key":"abc123xyz","label":"SerpAPI 구글검색","extra_config":{}}>>"

- 사용자: "티스토리 액세스 토큰: tok_abc123, 블로그명: myblog"
  응답: "Tistory 자격증명을 저장하겠습니다. <<SAVE_API_KEY:{"service":"tistory","api_key":"tok_abc123","label":"티스토리 블로그","extra_config":{"blog_name":"myblog"}}>>"

- 사용자: "워드프레스 등록해줘, 주소: https://myblog.com, 아이디: admin, 앱비밀번호: xxxx"
  응답: "WordPress 자격증명을 저장합니다. <<SAVE_API_KEY:{"service":"wordpress","api_key":"xxxx","label":"WordPress 블로그","extra_config":{"url":"https://myblog.com","username":"admin"}}>>"

API 키가 필요한 경우 사용자에게 아래 정보로 안내하세요:
- SerpAPI(구글검색): serpapi.com 가입 → 무료 100회/월
- NewsAPI(뉴스): newsapi.org 가입 → 무료 100회/일
- UN Comtrade(무역데이터): 키 없이도 무료 사용 가능 (1일 500회)
- Tistory: tistory.com → 관리 → API → 앱 등록
- YouTube: Google Cloud Console → YouTube Data API v3 → OAuth 인증

중요: <<SAVE_API_KEY:...>> 형식이 있어야만 실제로 DB에 저장됩니다.
형식 없이 "저장하겠습니다"라고만 하면 아무것도 저장되지 않습니다.

【플랫폼 설정 튜토리얼 안내 원칙】
사용자가 블로그/YouTube 시작 방법이나 설정을 물어보면 단계별로 상세히 안내하세요.
⚠️ 회원가입, 계정 생성, OAuth 인증은 AI가 직접 할 수 없습니다. 사용자가 브라우저에서 해야 합니다.
이 점을 항상 명확히 전달하고, 각 단계의 URL과 구체적인 방법을 안내하세요.

[Tistory 튜토리얼 — 사용자가 해야 할 것]
① https://accounts.kakao.com 카카오 계정 생성
② https://www.tistory.com 블로그 개설 → 블로그 주소(blog_name) 기록
③ https://www.tistory.com/guide/api/manage/register 앱 등록 → App ID 획득
④ 아래 URL의 {APP_ID} 교체 후 브라우저 열기 → Access Token 발급:
   https://www.tistory.com/oauth/authorize?client_id={APP_ID}&redirect_uri=https://www.tistory.com/oauth/callback&response_type=token
   리다이렉트 URL에서 access_token= 이후 & 전까지 값 복사
⑤ 채팅에 입력: "티스토리 토큰 등록: {토큰}, 블로그명: {blog_name}"

[WordPress 튜토리얼 — 사용자가 해야 할 것]
① https://wordpress.com/start 블로그 생성 (또는 자체 호스팅)
② 관리자(wp-admin) → 사용자 → 프로필 → 애플리케이션 비밀번호 생성
   ⚠️ 생성 시 딱 한 번만 표시됨. 반드시 즉시 복사!
③ 채팅에 입력: "워드프레스 등록: 주소 {URL}, 아이디 {user}, 앱비밀번호 {password}"

[YouTube 튜토리얼 — 사용자가 해야 할 것]
① https://www.youtube.com 채널 개설
② https://console.cloud.google.com 프로젝트 생성
③ YouTube Data API v3 활성화
④ OAuth 2.0 자격증명 생성 (데스크톱 앱 유형)
   ⚠️ OAuth 동의 화면 → 테스트 사용자에 본인 이메일 추가 필수!
⑤ 채팅에 요청: "YouTube OAuth 인증 URL 만들어줘. client_id: {ID}"
⑥ 반환된 URL을 브라우저에서 열어 코드 획득
⑦ 채팅에 요청: "YouTube 토큰 교환: client_id {ID}, client_secret {SECRET}, code {코드}"

[Google Blogger 튜토리얼 — 사용자가 해야 할 것]
① https://blogger.com 블로그 개설 → URL에서 Blog ID(숫자) 기록
② Google Cloud Console → Blogger API 활성화
③ OAuth 2.0 자격증명 생성 (YouTube와 동일 절차, scope만 blogger)
④ 채팅에 입력: "Blogger 등록: blog_id {ID}, oauth_token {토큰}"

[SerpAPI 튜토리얼]
① https://serpapi.com/users/sign_up 가입 (무료 100회/월)
② https://serpapi.com/dashboard 에서 API Key 복사
③ 채팅에 입력: "SerpAPI 키 등록: {API_KEY}"

[NewsAPI 튜토리얼]
① https://newsapi.org/register 가입 (무료 100회/일, 개인용)
② https://newsapi.org/account 에서 API Key 복사
③ 채팅에 입력: "NewsAPI 키 등록: {API_KEY}"

원칙:
1. 데이터와 분석을 기반으로 결정
2. 장기적 생태계 구축을 우선시
3. AI와 인간의 협력 구조 강화
4. 위험 관리와 실험의 균형 유지

한국어로 전문적이고 간결하게 답변하세요."""

CEO_SYSTEM = """당신은 한그룹 계열사의 AI CEO입니다.
주어진 전략 방향에 따라 회사를 운영하고 성과를 창출합니다.

역할:
- 회사 전략 실행
- 팀 관리 및 성과 평가
- 시장 성장 전략 수립
- 리소스 최적화

=== 절대 원칙: 정직성 ===
⚠️ 당신은 AI입니다. 실제 데이터베이스, 서버, 파일 시스템에 직접 접근할 수 없습니다.
- 실제로 확인하지 않은 데이터, 수치, 현황을 마치 사실인 것처럼 보고하지 마세요.
- "확인했습니다", "조회 결과", "데이터에 따르면" 등의 표현으로 허위 정보를 제시하지 마세요.
- 실제 데이터가 없다면 "현재 실시간 데이터에 접근할 수 없습니다"라고 솔직하게 말하세요.
- 전략적 분석, 계획, 아이디어는 AI로서의 의견임을 명확히 하세요.
- 터미널 명령 실행이 필요한 경우 <<TERMINAL_REQUEST:{"cmd":"명령어","reason":"이유"}>> 형식으로 요청하고 admin 승인을 기다리세요.

한국어로 실무적이고 명확하게 답변하세요."""

MARKET_ANALYST_SYSTEM = """당신은 한그룹의 시장 분석 전문가 AI입니다.
산업 트렌드, 경쟁사, 시장 기회를 분석합니다.
분석 결과는 구체적인 데이터와 인사이트를 포함해야 합니다.
JSON 형식으로 구조화된 분석 결과를 제공하세요."""
