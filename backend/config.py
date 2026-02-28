"""
Vaarta backend configuration.
Single source of truth for environment and app settings.
"""

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

load_dotenv()


def get_settings():
    """Return app settings (use as FastAPI Depends or call directly)."""
    return Settings()


class Settings:
    """Application settings loaded from environment."""

    # App
    APP_TITLE: str = "Vaarta API"
    APP_VERSION: str = "3.0.0"
    ALLOWED_ORIGINS: list[str]
    BASE_URL: str

    # Storage: "file" | "postgres" (postgres not implemented yet)
    VAARTA_STORAGE: Literal["file", "postgres"] = "file"
    VAARTA_DATA_DIR: Path

    # Optional WhatsApp
    VAARTA_ALWAYS_SEND_TO: str = ""
    VAARTA_BASE_URL: str = ""

    # API keys (required for core features)
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # Chat: "openai" | "groq" (Groq uses OpenAI-compatible API via Groq; model e.g. openai/gpt-oss-120b)
    CHAT_PROVIDER: Literal["openai", "groq"] = "groq"
    GROQ_API_KEY: str = ""
    GROQ_CHAT_MODEL: str = "openai/gpt-oss-120b"

    # Voice: STT (Groq Whisper) and TTS (Google Cloud Text-to-Speech)
    GOOGLE_TTS_API_KEY: str = ""

    def __init__(self):
        origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
        self.ALLOWED_ORIGINS = [o.strip() for o in origins.split(",") if o.strip()]
        self.BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
        self.VAARTA_STORAGE = os.environ.get("VAARTA_STORAGE", "file").lower()
        if self.VAARTA_STORAGE not in ("file", "postgres"):
            self.VAARTA_STORAGE = "file"
        data_dir = os.environ.get("VAARTA_DATA_DIR", "data")
        self.VAARTA_DATA_DIR = Path(data_dir)
        self.VAARTA_ALWAYS_SEND_TO = (os.environ.get("VAARTA_ALWAYS_SEND_TO") or "").strip()
        self.VAARTA_BASE_URL = (os.environ.get("VAARTA_BASE_URL") or "").strip()
        self.ANTHROPIC_API_KEY = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
        self.OPENAI_API_KEY = (os.environ.get("OPENAI_API_KEY") or "").strip()
        provider = (os.environ.get("CHAT_PROVIDER") or "openai").lower()
        self.CHAT_PROVIDER = "groq" if provider == "groq" else "openai"
        self.GROQ_API_KEY = (os.environ.get("GROQ_API_KEY") or "").strip()
        self.GROQ_CHAT_MODEL = (os.environ.get("GROQ_CHAT_MODEL") or "openai/gpt-oss-120b").strip()
        self.GOOGLE_TTS_API_KEY = (os.environ.get("GOOGLE_TTS_API_KEY") or "").strip()

    @property
    def database_url(self) -> str:
        """PostgreSQL connection URL when VAARTA_STORAGE=postgres."""
        return (os.environ.get("DATABASE_URL") or "").strip()
