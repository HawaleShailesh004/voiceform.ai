"""
Vaarta WhatsApp Delivery — via Twilio
Sends filled PDF to user's WhatsApp after form completion.

Setup (one-time):
  1. pip install twilio
  2. Set env vars:
       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN=your_auth_token
       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Twilio sandbox number
       VAARTA_BASE_URL=https://your-domain.com      # public URL for PDF serving

  3. For sandbox: user must first send "join <sandbox-word>" to +14155238886
     For production: request WhatsApp Business API approval from Meta.
"""

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _twilio_client():
    """Lazy-load Twilio client — only fails if actually called without creds."""
    try:
        from twilio.rest import Client
        sid   = os.environ.get("TWILIO_ACCOUNT_SID")
        token = os.environ.get("TWILIO_AUTH_TOKEN")
        if not sid or not token:
            raise ValueError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set")
        return Client(sid, token)
    except ImportError:
        raise RuntimeError("twilio package not installed. Run: pip install twilio")


def _normalise_phone(phone: str) -> str:
    """
    Normalise Indian phone to E.164 format for WhatsApp.
    Accepts: 9876543210 / +919876543210 / 09876543210 / 91-9876543210
    """
    import re
    digits = re.sub(r"[\s\-\+\(\)]", "", phone)
    if digits.startswith("091"):
        digits = digits[1:]
    if digits.startswith("91") and len(digits) == 12:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+91{digits}"
    # Already has country code
    if digits.startswith("91") and len(digits) > 10:
        return f"+{digits}"
    return f"+{digits}"


async def send_whatsapp_pdf(
    phone: str,
    pdf_path: str,
    form_title: str,
    session_id: str,
    lang: str = "en",
) -> dict:
    """
    Send filled PDF to user via WhatsApp.

    Args:
        phone:      User's phone number (Indian 10-digit or E.164)
        pdf_path:   Local path to the filled PDF
        form_title: Form name shown in the message
        session_id: Session ID (used to generate public PDF URL)
        lang:       'en' or 'hi' — determines message language

    Returns:
        {"success": True, "message_sid": "...", "to": "whatsapp:+91..."}
        or
        {"success": False, "error": "..."}
    """
    try:
        normalised = _normalise_phone(phone)
        to_wa      = f"whatsapp:{normalised}"
        from_wa    = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
        base_url   = os.environ.get("VAARTA_BASE_URL", "http://localhost:8000").rstrip("/")
        is_public  = "localhost" not in base_url and "127.0.0.1" not in base_url
        pdf_url    = f"{base_url}/api/sessions/{session_id}/filled-pdf" if is_public else None

        body = _compose_message(form_title, lang, include_pdf_above=is_public)

        client = _twilio_client()
        create_kw: dict = {"from_": from_wa, "to": to_wa, "body": body}
        if pdf_url:
            create_kw["media_url"] = [pdf_url]
        else:
            logger.info("VAARTA_BASE_URL is local — sending text only (no PDF attachment)")
        message = client.messages.create(**create_kw)

        logger.info(f"WhatsApp sent to {normalised} | SID: {message.sid}")
        return {
            "success":     True,
            "message_sid": message.sid,
            "to":          to_wa,
            "status":      message.status,
        }

    except Exception as e:
        logger.error(f"WhatsApp delivery failed: {e}")
        return {"success": False, "error": str(e)}


def _compose_message(form_title: str, lang: str, include_pdf_above: bool = True) -> str:
    if lang == "hi":
        pdf_line = "ऊपर दिया गया PDF आपका भरा हुआ फ़ॉर्म है। इसे सुरक्षित रखें।" if include_pdf_above else "आपका भरा हुआ फ़ॉर्म चैट में डाउनलोड के लिए तैयार है।"
        return (
            f"नमस्ते! 🙏\n\n"
            f"आपका *{form_title}* सफलतापूर्वक भर दिया गया है।\n\n"
            f"{pdf_line}\n\n"
            f"_Vaarta द्वारा भेजा गया_ ✅"
        )
    pdf_line = "The PDF above is your completed form. Please save it for your records." if include_pdf_above else "Your filled form is ready to download in the chat."
    return (
        f"Hello! 👋\n\n"
        f"Your *{form_title}* has been filled successfully.\n\n"
        f"{pdf_line}\n\n"
        f"_Sent via Vaarta_ ✅"
    )


def is_configured() -> bool:
    """Check if Twilio credentials are present — used to conditionally show WA option in UI."""
    return bool(
        os.environ.get("TWILIO_ACCOUNT_SID") and
        os.environ.get("TWILIO_AUTH_TOKEN")
    )