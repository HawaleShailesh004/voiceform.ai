"""
Voice API: STT (transcribe) and TTS (synthesize).
"""
import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from services.stt import STTError, transcribe_audio
from services.tts import TTSError, synthesize_speech

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audio", tags=["audio"])


class SynthesizeBody(BaseModel):
    text: str
    lang: str = "en"


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(..., description="Audio file (webm, mp3, wav, m4a, etc.)"),
    language: Optional[str] = Form(None, description="Optional language hint (e.g. en, hi, mr)"),
):
    """
    Transcribe audio to text using Groq Whisper.
    Returns JSON: { "text": "..." } or error with code and detail.
    """
    try:
        content = await file.read()
    except Exception as e:
        logger.warning("Failed to read upload: %s", e)
        raise HTTPException(400, detail={"code": "stt_bad_request", "message": "Failed to read audio file."})

    if not content:
        raise HTTPException(400, detail={"code": "stt_empty_file", "message": "Audio file is empty."})

    try:
        text = transcribe_audio(content, filename=file.filename or "audio.webm", language_hint=language)
        return {"text": text}
    except STTError as e:
        raise HTTPException(
            422 if e.code in ("stt_no_speech", "stt_empty_file") else 400,
            detail={"code": e.code, "message": e.message},
        )
    except Exception as e:
        logger.exception("Transcribe error: %s", e)
        raise HTTPException(500, detail={"code": "stt_error", "message": "Speech recognition failed."})


@router.post("/synthesize")
async def synthesize(body: SynthesizeBody):
    """
    Synthesize text to speech using Google Cloud TTS.
    Returns MP3 audio bytes or JSON error with code and detail.
    """
    if not body.text or not body.text.strip():
        raise HTTPException(400, detail={"code": "tts_empty_text", "message": "No text to speak."})

    try:
        audio_bytes = synthesize_speech(body.text.strip(), lang=body.lang)
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"},
        )
    except TTSError as e:
        status = 400
        if e.code == "tts_not_configured":
            status = 503
        elif e.code in ("tts_unauthorized", "tts_rate_limit"):
            status = 403 if e.code == "tts_unauthorized" else 429
        elif e.code in ("tts_timeout", "tts_network", "tts_server_error"):
            status = 503
        raise HTTPException(status, detail={"code": e.code, "message": e.message})
    except Exception as e:
        logger.exception("Synthesize error: %s", e)
        raise HTTPException(500, detail={"code": "tts_error", "message": "Speech synthesis failed."})


@router.get("/status")
async def voice_status():
    """
    Check if STT and TTS are configured (API keys present).
    Does not validate keys; use for feature flags only.
    """
    from config import get_settings
    s = get_settings()
    return {
        "stt_available": bool(s.GROQ_API_KEY and s.GROQ_API_KEY.strip()),
        "tts_available": bool(s.GOOGLE_TTS_API_KEY and s.GOOGLE_TTS_API_KEY.strip()),
    }
