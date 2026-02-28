"""WhatsApp send and status."""

import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from api.deps import require_session
from schemas.requests import WhatsAppDelivery

import store

logger = logging.getLogger(__name__)
router = APIRouter(tags=["whatsapp"])


def _require_form(form_id: str) -> dict:
    form = store.load_form(form_id)
    if not form:
        raise HTTPException(404, f"Form '{form_id}' not found")
    return form


@router.post("/api/sessions/{session_id}/whatsapp")
async def send_whatsapp(
    session: Annotated[dict, Depends(require_session)],
    body: WhatsAppDelivery,
):
    session_id = session["session_id"]
    form = _require_form(session["form_id"])
    session["whatsapp_phone"] = body.phone
    if body.lang:
        session["lang"] = body.lang
    store.save_session(session_id, session)
    filled_path = session.get("filled_pdf_path")
    if filled_path and Path(filled_path).exists():
        from whatsapp_delivery import send_whatsapp_pdf, is_configured
        if not is_configured():
            raise HTTPException(
                503,
                "WhatsApp not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
            )
        result = await send_whatsapp_pdf(
            phone=body.phone,
            pdf_path=filled_path,
            form_title=form.get("form_title", "your form"),
            session_id=session_id,
            lang=body.lang or session.get("lang", "en"),
            recipient_label="user",
        )
        if not result["success"]:
            raise HTTPException(500, f"WhatsApp send failed: {result['error']}")
        return JSONResponse({
            "status": "sent",
            "to": result["to"],
            "message_sid": result["message_sid"],
        })
    return JSONResponse({
        "status": "scheduled",
        "message": "Phone saved. PDF will be sent when form is completed.",
    })


@router.get("/api/whatsapp/status")
async def whatsapp_status():
    from whatsapp_delivery import is_configured
    configured = is_configured()
    logger.info("whatsapp_status: configured=%s", configured)
    return JSONResponse({"configured": configured})
