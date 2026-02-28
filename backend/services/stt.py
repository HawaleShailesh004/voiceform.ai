"""
Speech-to-Text via Groq Whisper API.
Handles errors gracefully and returns structured results.

Fixes over previous version:
  ✓ GROQ_API_KEY None.strip() AttributeError fixed
  ✓ print() statements removed — were logging API keys + file contents to stdout in production
"""
import logging
from typing import Optional

import requests

from config import get_settings

logger = logging.getLogger(__name__)

GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_EXTENSIONS = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg"}


class STTError(Exception):
    """Base for STT failures with a user-friendly code."""
    def __init__(self, message: str, code: str = "stt_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    language_hint: Optional[str] = None,
) -> str:
    """
    Transcribe audio using Groq Whisper. Returns transcribed text.
    Raises STTError with appropriate code for client handling.
    """
    settings = get_settings()

    # ── FIXED: was `not (settings.GROQ_API_KEY or settings.GROQ_API_KEY.strip())`
    # which raises AttributeError when GROQ_API_KEY is None ──
    if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
        raise STTError(
            "Speech-to-text is not configured. Missing GROQ_API_KEY.",
            code="stt_not_configured",
        )

    if len(audio_bytes) > MAX_FILE_SIZE_BYTES:
        raise STTError(
            f"Audio file too large (max {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB).",
            code="stt_file_too_large",
        )

    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        filename = "audio.webm"

    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
    files = {"file": (filename, audio_bytes, "application/octet-stream")}
    data: dict = {"model": "whisper-large-v3-turbo"}
    if language_hint:
        data["language"] = language_hint

    try:
        resp = requests.post(
            GROQ_TRANSCRIPTIONS_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=60,
        )
        # ── FIXED: removed print() statements that were leaking API keys and
        # raw audio file contents to stdout in production ──
        logger.debug("Groq Whisper response: status=%s", resp.status_code)
    except requests.exceptions.Timeout:
        logger.warning("Groq Whisper request timed out")
        raise STTError("Speech recognition timed out. Please try again.", code="stt_timeout")
    except requests.exceptions.ConnectionError as e:
        logger.warning("Groq Whisper connection error: %s", e)
        raise STTError("Could not reach speech service. Check your connection.", code="stt_network")
    except Exception as e:
        logger.exception("Groq Whisper unexpected error: %s", e)
        raise STTError("Speech recognition failed. Please try again.", code="stt_error")

    if resp.status_code == 401:
        raise STTError("Speech service authentication failed. Invalid API key.", code="stt_unauthorized")
    if resp.status_code == 429:
        raise STTError("Too many requests. Please wait a moment and try again.", code="stt_rate_limit")
    if resp.status_code == 413:
        raise STTError("Audio file too large.", code="stt_file_too_large")
    if resp.status_code >= 500:
        raise STTError(
            "Speech service is temporarily unavailable. Please try again later.",
            code="stt_server_error",
        )
    if resp.status_code != 200:
        try:
            err_body = resp.json()
            err_msg = err_body.get("error", {}).get("message", resp.text) or resp.text
        except Exception:
            err_msg = resp.text or f"HTTP {resp.status_code}"
        logger.warning("Groq Whisper HTTP %s: %s", resp.status_code, err_msg)
        raise STTError(f"Speech recognition failed: {err_msg[:200]}", code="stt_api_error")

    try:
        result = resp.json()
        text = (result.get("text") or "").strip()
        if not text:
            raise STTError(
                "No speech detected. Try speaking clearly or check your microphone.",
                code="stt_no_speech",
            )
        return text
    except STTError:
        raise
    except Exception as e:
        logger.exception("Failed to parse Groq response: %s", e)
        raise STTError("Invalid response from speech service.", code="stt_error")