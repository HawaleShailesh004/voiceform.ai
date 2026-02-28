"""
Text-to-Speech via Google Cloud Text-to-Speech REST API.
Supports en, hi, mr and other Indian languages; falls back to en-US when voice not found.

Fixes over previous version:
  ✓ Inverted null-check bug fixed (was: `not (text or not text.strip())`)
  ✓ Marathi (mr) now has its own voice entry
"""
import base64
import logging

import requests

from config import get_settings

logger = logging.getLogger(__name__)

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"

LANG_TO_CODE = {
    "en": "en-IN",
    "hi": "hi-IN",
    "mr": "mr-IN",   # Marathi — distinct from Hindi despite shared Devanagari script
    "ta": "ta-IN",
    "te": "te-IN",
    "gu": "gu-IN",
    "bn": "bn-IN",
}
DEFAULT_LANG_CODE = "en-US"
MAX_TEXT_LENGTH = 5000  # Google limit per request


class TTSError(Exception):
    """Base for TTS failures with a user-friendly code."""
    def __init__(self, message: str, code: str = "tts_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _lang_code_for_lang(lang: str) -> str:
    lang_lower = (lang or "en").strip().lower()
    return LANG_TO_CODE.get(lang_lower, DEFAULT_LANG_CODE)


def synthesize_speech(text: str, lang: str = "en") -> bytes:
    """
    Synthesize speech using Google Cloud TTS. Returns raw MP3 bytes.
    Raises TTSError with appropriate code for client handling.
    """
    settings = get_settings()

    # ── FIXED: was `not (text or not text.strip())` which never fired correctly ──
    if not text or not text.strip():
        raise TTSError("No text to speak.", code="tts_empty_text")

    if not settings.GOOGLE_TTS_API_KEY or not settings.GOOGLE_TTS_API_KEY.strip():
        raise TTSError("Text-to-speech is not configured. Missing GOOGLE_TTS_API_KEY.", code="tts_not_configured")

    clean_text = text.strip()
    if len(clean_text) > MAX_TEXT_LENGTH:
        clean_text = clean_text[:MAX_TEXT_LENGTH]

    lang_code = _lang_code_for_lang(lang)
    url = f"{GOOGLE_TTS_URL}?key={settings.GOOGLE_TTS_API_KEY}"
    body = {
        "input": {"text": clean_text},
        "voice": {"languageCode": lang_code},
        "audioConfig": {"audioEncoding": "MP3", "sampleRateHertz": 24000},
    }

    try:
        resp = requests.post(url, json=body, timeout=30)
    except requests.exceptions.Timeout:
        logger.warning("Google TTS request timed out")
        raise TTSError("Speech synthesis timed out. Please try again.", code="tts_timeout")
    except requests.exceptions.ConnectionError as e:
        logger.warning("Google TTS connection error: %s", e)
        raise TTSError("Could not reach speech service. Check your connection.", code="tts_network")
    except Exception as e:
        logger.exception("Google TTS unexpected error: %s", e)
        raise TTSError("Speech synthesis failed. Please try again.", code="tts_error")

    if resp.status_code == 400:
        try:
            err = resp.json()
            err_msg = err.get("error", {}).get("message", resp.text) or resp.text
        except Exception:
            err_msg = resp.text or "Bad request"
        if "API key" in err_msg or "invalid" in err_msg.lower():
            raise TTSError("Text-to-speech authentication failed. Check API key.", code="tts_unauthorized")
        raise TTSError(f"Invalid request: {err_msg[:200]}", code="tts_bad_request")

    if resp.status_code == 403:
        try:
            err = resp.json()
            err_body = err.get("error", {})
            err_msg = err_body.get("message", resp.text) or resp.text
            err_status = err_body.get("status", "")
            logger.warning("Google TTS 403: status=%s message=%s", err_status, err_msg)
            if "API has not been used" in err_msg or "enabled" in err_msg.lower():
                raise TTSError(
                    "Text-to-Speech API is not enabled. Enable it at: "
                    "console.cloud.google.com/apis/library/texttospeech.googleapis.com",
                    code="tts_unauthorized",
                )
            if "billing" in err_msg.lower() or "quota" in err_msg.lower():
                raise TTSError(
                    "Billing or quota issue. Enable billing for the project "
                    "(free tier still applies) or check quota.",
                    code="tts_unauthorized",
                )
            raise TTSError(f"Access denied (403): {err_msg[:180]}", code="tts_unauthorized")
        except TTSError:
            raise
        except Exception:
            raise TTSError(
                "Text-to-speech access denied (403). Enable Cloud Text-to-Speech API and check API key.",
                code="tts_unauthorized",
            )

    if resp.status_code == 429:
        raise TTSError("Too many requests. Please wait a moment and try again.", code="tts_rate_limit")
    if resp.status_code >= 500:
        raise TTSError("Speech service is temporarily unavailable. Please try again later.", code="tts_server_error")
    if resp.status_code != 200:
        try:
            err = resp.json()
            err_msg = err.get("error", {}).get("message", resp.text) or resp.text
        except Exception:
            err_msg = resp.text or f"HTTP {resp.status_code}"
        logger.warning("Google TTS HTTP %s: %s", resp.status_code, err_msg)
        raise TTSError(f"Speech synthesis failed: {err_msg[:200]}", code="tts_api_error")

    try:
        data = resp.json()
        b64 = data.get("audioContent")
        if not b64:
            raise TTSError("No audio returned from speech service.", code="tts_error")
        return base64.b64decode(b64)
    except TTSError:
        raise
    except Exception as e:
        logger.exception("Failed to decode Google TTS response: %s", e)
        raise TTSError("Invalid response from speech service.", code="tts_error")