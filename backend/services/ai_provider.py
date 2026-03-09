"""
AI Provider abstraction layer.
Supports: anthropic | openai | gemini | ollama
Ollama is the default local provider (no API key required).
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

        # Non-ollama providers require an API key; fall back to ollama
        if not self.api_key and self.provider not in ("ollama",):
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
        }
        return mapping.get(self.provider, settings.OLLAMA_MODEL)

    def chat(
        self,
        messages: List[Dict[str, str]],
        system: str = "",
        session_type: str = "general",
        max_tokens: int = 1024,
    ) -> str:
        try:
            if self.provider == "anthropic":
                return self._call_anthropic(messages, system, max_tokens)
            elif self.provider == "openai":
                return self._call_openai(messages, system, max_tokens)
            elif self.provider == "gemini":
                return self._call_gemini(messages, system, max_tokens)
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

    def _call_gemini(
        self, messages: List[Dict], system: str, max_tokens: int
    ) -> str:
        import google.generativeai as genai

        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(self.model, system_instruction=system)
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
            json={"model": self.model, "messages": full_messages, "stream": False},
            timeout=60,
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

한국어로 실무적이고 명확하게 답변하세요."""

MARKET_ANALYST_SYSTEM = """당신은 한그룹의 시장 분석 전문가 AI입니다.
산업 트렌드, 경쟁사, 시장 기회를 분석합니다.
분석 결과는 구체적인 데이터와 인사이트를 포함해야 합니다.
JSON 형식으로 구조화된 분석 결과를 제공하세요."""
