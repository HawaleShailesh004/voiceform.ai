"""
Vaarta WhatsApp Delivery — via Twilio
Sends filled PDF to user's WhatsApp after form completion.

Setup (one-time):
  1. pip install twilio cloudinary
  2. Set env vars:
       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN=your_auth_token
       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Twilio sandbox number
       VAARTA_BASE_URL=https://your-domain.com      # optional: public URL for PDF (if not set, Cloudinary is used)
       CLOUDINARY_CLOUD_NAME=your_cloud_name       # for PDF attachment when VAARTA_BASE_URL is local
       CLOUDINARY_API_KEY=...
       CLOUDINARY_API_SECRET=...

  3. For sandbox: the recipient must first send "join <sandbox-word>" to your
     TWILIO_WHATSAPP_FROM number. Otherwise Twilio returns 201 but the message
     may not be delivered to WhatsApp.
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
    *,
    recipient_label: Optional[str] = None,
    pdf_url_override: Optional[str] = None,
) -> dict:
    """
    Send filled PDF to user via WhatsApp.

    Args:
        phone:      User's phone number (Indian 10-digit or E.164)
        pdf_path:   Local path to the filled PDF
        form_title: Form name shown in the message
        session_id: Session ID (used to generate public PDF URL)
        lang:       'en' or 'hi' — determines message language
        pdf_url_override: If set, use this URL instead of uploading (avoids duplicate Cloudinary uploads)

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
        pdf_url    = pdf_url_override or (f"{base_url}/api/sessions/{session_id}/filled-pdf" if is_public else None)

        # When base URL is local, upload PDF to Cloudinary (unless URL already provided)
        if not pdf_url and Path(pdf_path).exists():
            from services.cloudinary_storage import upload_pdf, is_configured as cloudinary_configured
            if cloudinary_configured():
                pdf_url = upload_pdf(pdf_path, public_id_prefix="vaarta/filled")
                if pdf_url:
                    logger.info("Using Cloudinary URL for WhatsApp PDF attachment")
            if not pdf_url:
                logger.info("VAARTA_BASE_URL is local and Cloudinary not configured — sending text only (no PDF attachment)")

        body = _compose_message(form_title, lang, include_pdf_above=bool(pdf_url))

        client = _twilio_client()
        create_kw: dict = {"from_": from_wa, "to": to_wa, "body": body}
        if pdf_url:
            create_kw["media_url"] = [pdf_url]
        message = client.messages.create(**create_kw)

        who = f" ({recipient_label})" if recipient_label else ""
        logger.info("WhatsApp sent to %s%s | SID: %s | media: %s", normalised, who, message.sid, getattr(message, "num_media", "?"))
        if pdf_url and getattr(message, "num_media", 0) == 0:
            logger.warning("Twilio accepted the message but num_media=0 — PDF may not be attached. Check URL is public and PDF <5MB. URL: %s...", (pdf_url or "")[:80])
        if pdf_url and "localhost" in base_url:
            logger.warning("If the WhatsApp message didn't arrive: from your phone, send 'join <your-sandbox-word>' to %s first (24h session).", from_wa.replace("whatsapp:", ""))

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