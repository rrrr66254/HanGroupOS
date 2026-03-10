from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "HAN Group OS"
    VERSION: str = "27.0.0"
    DEBUG: bool = True

    # Security
    SECRET_KEY: str = "han-group-os-secret-key-change-in-production-v27"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h

    # Database
    DATABASE_URL: str = "sqlite:///./han_group.db"

    # AI Providers
    DEFAULT_PROVIDER: str = "ollama"  # ollama | anthropic | openai | gemini | ktransformers
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"  # Ollama 기본 주소
    OLLAMA_MODEL: str = "qwen2.5"     # llama3 / qwen2.5

    # Default models per provider
    ANTHROPIC_DEFAULT_MODEL: str = "claude-haiku-4-5-20251001"
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"
    GEMINI_DEFAULT_MODEL: str = "gemini-1.5-flash"

    # ── KTransformers (CPU-GPU 하이브리드 저VRAM 추론) ─────────────────────────
    # 설치: pip install ktransformers
    # 실행: ktransformers --model Qwen/Qwen2.5-7B-Instruct --port 30000
    # DeepSeek-R1 (24GB VRAM + 382GB RAM): ktransformers --model deepseek-ai/DeepSeek-R1
    # OpenAI 호환 API를 http://localhost:30000/v1 에 노출
    # ⚠️ 미실행 시 Ollama로 자동 폴백 (KTRANSFORMERS_FALLBACK_TO_OLLAMA=True)
    KTRANSFORMERS_BASE_URL: str = "http://localhost:30000/v1"
    KTRANSFORMERS_MODEL: str = "Qwen/Qwen2.5-7B-Instruct"
    KTRANSFORMERS_FALLBACK_TO_OLLAMA: bool = True  # 서버 미실행 시 Ollama 자동 폴백

    # ── Context Engineer (토큰 최적화) ────────────────────────────────────────
    # 모델에 전송하는 총 컨텍스트 토큰 한도 (응답 토큰 제외)
    # 초과 시: 시스템 슬리밍 → 히스토리 윈도잉으로 자동 압축
    CONTEXT_MAX_TOKENS: int = 6000
    # 토큰 초과 시에도 최소 보존할 메시지 수 (최근 N개는 절대 제거 안 함)
    CONTEXT_MIN_MESSAGES: int = 4
    # 이 메시지 수 이상이면 시스템 프롬프트 튜토리얼 섹션 제거 (~30% 절약)
    CONTEXT_SLIM_AFTER: int = 10

    class Config:
        env_file = ".env"


settings = Settings()

