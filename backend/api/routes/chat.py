"""Chat open and chat turn."""

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from api.helpers import progress
from schemas.requests import ChatMessage, ChatOpen

import store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _require_session(session_id: str) -> dict:
    session = store.load_session(session_id)
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found")
    return session


def _require_form(form_id: str) -> dict:
    form = store.load_form(form_id)
    if not form:
        raise HTTPException(404, f"Form '{form_id}' not found")
    return form


@router.post("/open")
async def chat_open(body: ChatOpen):
    session = _require_session(body.session_id)
    form = _require_form(session["form_id"])
    from chat_engine import get_opening_message
    opening = await get_opening_message(form, lang=body.lang)
    session["chat_history"] = [{"role": "assistant", "content": opening}]
    session["lang"] = body.lang
    store.save_session(body.session_id, session)
    return JSONResponse({"message": opening})


@router.post("")
async def chat(msg: ChatMessage):
    session = _require_session(msg.session_id)
    form = _require_form(session["form_id"])
    lang = msg.lang or session.get("lang", "en")
    try:
        from chat_engine import run_chat_turn
        result = await run_chat_turn(
            user_message=msg.message,
            session=session,
            form_schema=form,
            lang=lang,
        )
    except Exception as e:
        logger.error("Chat error: %s", e, exc_info=True)
        raise HTTPException(500, f"Chat processing failed: {e}") from e

    extracted = result.get("extracted", {}) or {}
    wa_phone = extracted.pop("_whatsapp_phone", None)
    if wa_phone and wa_phone != "__SKIP__":
        session["whatsapp_phone"] = wa_phone
    elif wa_phone == "__SKIP__":
        session["whatsapp_phone"] = "__SKIP__"
    for k, v in extracted.items():
        existing = session["collected"].get(k)
        if v == "SKIPPED" and existing not in (None, "", "N/A"):
            continue
        session["collected"][k] = v
    session["chat_history"] = result["updated_history"]
    session["updated_at"] = datetime.utcnow().isoformat()
    if result.get("detected_lang"):
        session["lang"] = result["detected_lang"]
        lang = result["detected_lang"]
    if result.get("last_asked_field"):
        session["last_asked_field"] = result["last_asked_field"]
    if result.get("is_complete"):
        session["status"] = "completed"
    filled, total = progress(session, form)
    session["progress"] = round(filled / total * 100) if total else 0
    store.save_session(msg.session_id, session)

    if session.get("whatsapp_phone") and session["whatsapp_phone"] != "__SKIP__":
        from whatsapp_delivery import is_configured
        if is_configured():
            async def _generate_and_send_wa():
                try:
                    sess = store.load_session(msg.session_id)
                    if not sess or not sess.get("whatsapp_phone") or sess.get("whatsapp_phone") == "__SKIP__":
                        return
                    f = store.load_form(sess["form_id"])
                    if not f:
                        return
                    from fillback import fill_form_pdf
                    out = await fill_form_pdf(
                        form_schema=f,
                        collected_data=sess["collected"],
                        session_id=msg.session_id,
                        partial=False,
                    )
                    sess["filled_pdf_path"] = out
                    store.save_session(msg.session_id, sess)
                    from whatsapp_delivery import send_whatsapp_pdf
                    await send_whatsapp_pdf(
                        phone=sess["whatsapp_phone"],
                        pdf_path=out,
                        form_title=f.get("form_title", "your form"),
                        session_id=msg.session_id,
                        lang=sess.get("lang", "en"),
                        recipient_label="user",
                    )
                except Exception as e:
                    logger.error("WhatsApp auto-send after completion: %s", e, exc_info=True)
            asyncio.create_task(_generate_and_send_wa())

    return JSONResponse({
        "reply": result["reply"],
        "extracted": result.get("extracted", {}),
        "confirmations": result.get("confirmations", []),
        "is_complete": result.get("is_complete", False),
        "progress": session["progress"],
        "collected": session["collected"],
        "lang": session.get("lang", "en"),
    })
