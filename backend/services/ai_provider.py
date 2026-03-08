"""
AI Provider abstraction layer.
Supports: anthropic | openai | gemini | ollama | mock
Falls back to mock when no API key is available.
"""
import json
import random
from typing import Optional, List, Dict, Any
from core.config import settings


MOCK_CHAIRMAN_RESPONSES = [
    "전략을 검토했습니다. 현재 시장 상황을 고려하면 {focus} 분야에서 빠른 진입이 유리합니다. 신규 계열사 설립을 승인하겠습니다.",
    "귀하의 제안을 분석했습니다. 리스크 대비 수익률이 긍정적으로 평가됩니다. 다음 단계로 진행할 것을 권장합니다.",
    "시장 분석 결과, {focus} 분야의 성장 잠재력이 높습니다. 한그룹의 핵심 역량과 시너지가 예상됩니다.",
    "제안된 전략은 그룹 비전과 일치합니다. 조직 구조 설계팀에 착수 지시를 내리겠습니다.",
    "현재 그룹 포트폴리오와의 연계성을 검토했습니다. 이 방향은 장기적으로 경쟁 우위를 확보할 수 있습니다.",
]

MOCK_CEO_RESPONSES = [
    "전략 방향을 수신했습니다. 팀과 함께 실행 계획을 수립하겠습니다.",
    "시장 진입 전략을 분석 중입니다. Q1 내 첫 번째 마일스톤 달성이 가능할 것으로 봅니다.",
    "경쟁사 분석을 완료했습니다. 차별화 포인트를 중심으로 제품 로드맵을 조정하겠습니다.",
    "운영 최적화 작업을 진행 중입니다. 효율성 15% 향상을 목표로 하고 있습니다.",
]

MOCK_GENERAL_RESPONSES = [
    "요청을 처리하였습니다. 결과를 검토해 주세요.",
    "분석이 완료되었습니다. 데이터 기반의 인사이트를 제공합니다.",
    "작업이 완료되었습니다. 추가 지시 사항이 있으시면 말씀해 주세요.",
]


def _mock_response(prompt: str, system: str = "", session_type: str = "chairman") -> str:
    focus = ""
    keywords = ["AI", "미디어", "데이터", "소프트웨어", "교육", "커머스", "금융", "헬스케어"]
    for kw in keywords:
        if kw in prompt:
            focus = kw
            break
    if not focus:
        focus = random.choice(keywords)

    # ── Company creation intent detection (Chairman only) ──────────────────
    if session_type == "chairman":
        creation_kw = ["만들어", "설립해", "설립하", "만들고", "만들어줘", "사업 시작", "회사 만", "계열사 만", "만들어라"]
        if any(kw in prompt for kw in creation_kw):
            industry_map = {
                "AI":      ("HAN AI솔루션",   "AI",        "AI 기반 솔루션 개발 및 서비스",      "AI로 세상을 혁신한다"),
                "데이터":   ("HAN데이터",      "데이터",    "데이터 분석 및 인사이트 플랫폼",      "데이터로 미래를 연다"),
                "소프트웨어":("HAN소프트",     "소프트웨어","소프트웨어 개발 및 SaaS 서비스",      "코드로 세상을 바꾼다"),
                "미디어":   ("HAN미디어",      "미디어",    "디지털 미디어 콘텐츠 플랫폼",         "미디어로 세상을 연결한다"),
                "교육":     ("HAN에듀",        "교육",      "AI 기반 맞춤형 교육 플랫폼",          "교육으로 세상을 변화시킨다"),
                "금융":     ("HAN파이낸스",    "금융",      "AI 기반 금융 분석 서비스",            "AI 금융의 새로운 기준"),
                "헬스케어": ("HAN헬스",        "헬스케어",  "디지털 헬스케어 솔루션",              "건강한 미래를 만든다"),
                "커머스":   ("HAN커머스",      "커머스",    "AI 추천 기반 전자상거래 플랫폼",       "스마트한 쇼핑의 미래"),
            }
            name, industry, description, vision = ("HAN신사업", "일반", "신규 전략 사업 개발", "새로운 가치를 창조한다")
            for kw, info in industry_map.items():
                if kw in prompt:
                    name, industry, description, vision = info
                    break
            import json as _json
            action_json = _json.dumps(
                {"name": name, "industry": industry, "description": description, "vision": vision},
                ensure_ascii=False,
            )
            return (
                f"{industry} 분야의 사업 타당성을 즉시 검토했습니다. "
                f"시장 성장성과 그룹 시너지가 확인됩니다. 계열사 설립을 승인합니다.\n\n"
                f"<<CREATE_COMPANY:{action_json}>>"
            )

    if session_type == "chairman":
        pool = MOCK_CHAIRMAN_RESPONSES
    elif session_type == "ceo":
        pool = MOCK_CEO_RESPONSES
    else:
        pool = MOCK_GENERAL_RESPONSES

    base = random.choice(pool).format(focus=focus)
    return base


class AIProvider:
    def __init__(
        self,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.provider = provider or settings.DEFAULT_PROVIDER
        self.api_key = api_key or self._get_default_key()
        self.model = model or self._get_default_model()
        self.base_url = base_url or ""

        # Non-ollama/mock providers require an API key; fall back to ollama
        if not self.api_key and self.provider not in ("ollama", "mock"):
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
            "mock": "mock-model",
        }
        return mapping.get(self.provider, "mock-model")

    def chat(
        self,
        messages: List[Dict[str, str]],
        system: str = "",
        session_type: str = "general",
        max_tokens: int = 1024,
    ) -> str:
        if self.provider == "mock":
            last_user = next(
                (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
            )
            return _mock_response(last_user, system, session_type)

        try:
            if self.provider == "anthropic":
                return self._call_anthropic(messages, system, max_tokens)
            elif self.provider == "openai":
                return self._call_openai(messages, system, max_tokens)
            elif self.provider == "gemini":
                return self._call_gemini(messages, system, max_tokens)
            elif self.provider == "ollama":
                return self._call_ollama(messages, system, max_tokens)
        except Exception as e:
            err = str(e)
            if "ollama" in self.provider or "Connection" in err or "connect" in err.lower():
                return (
                    f"⚠️ Ollama 연결 실패: {err}\n\n"
                    "Ollama가 실행 중인지 확인하고 관리자 > AI Provider 설정에서 Base URL을 설정해주세요.\n"
                    "예: http://localhost:11434"
                )
            return f"⚠️ AI 응답 오류: {err}"

        return "⚠️ 지원하지 않는 AI 프로바이더입니다."

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
    if config and (config.api_key or config.provider in ("ollama", "mock")):
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

예시:
- 사용자: "AI 소프트웨어 회사 만들어"
  응답: "검토 결과 AI 분야 계열사 설립을 승인합니다. <<CREATE_COMPANY:{"name":"HAN AI솔루션","industry":"소프트웨어","description":"AI 기반 소프트웨어 서비스","vision":"AI로 세상을 혁신한다"}>>"

- 사용자: "데이터 사업 설립해줘"
  응답: "데이터 사업의 성장 가능성을 확인했습니다. <<CREATE_COMPANY:{"name":"HAN데이터","industry":"데이터","description":"데이터 분석 및 AI 플랫폼","vision":"데이터로 미래를 연다"}>>"

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
