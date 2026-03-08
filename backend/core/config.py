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
    DEFAULT_PROVIDER: str = "ollama"  # ollama | anthropic | openai | gemini | mock
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = ""          # 빈 값이면 프론트엔드에서 설정 안내
    OLLAMA_MODEL: str = "qwen2.5"     # llama3 / qwen2.5

    # Default models per provider
    ANTHROPIC_DEFAULT_MODEL: str = "claude-haiku-4-5-20251001"
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"
    GEMINI_DEFAULT_MODEL: str = "gemini-1.5-flash"

    class Config:
        env_file = ".env"


settings = Settings()
