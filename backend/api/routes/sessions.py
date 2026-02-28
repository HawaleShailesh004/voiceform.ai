"""Session create, get, resume."""

import logging
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from api.deps import require_session
from api.helpers import progress, session_summary
from schemas.requests import SessionCreate

import store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/create")
async def create_session(data: SessionCreate):
    form = store.load_form(data.form_id)
    if not form:
        raise HTTPException(404, f"Form '{data.form_id}' not found")
    sid = str(uuid.uuid4())
    session = {
        "session_id": sid,
        "form_id": data.form_id,
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
        "collected": {},
        "chat_history": [],
        "progress": 0,
        "lang": "en",
        "last_asked_field": None,
    }
    store.save_session(sid, session)
    return JSONResponse({
        "session_id": sid,
        "form_title": form.get("form_title", ""),
        "field_count": len(form.get("fields", [])),
    })


@router.get("/{session_id}")
async def get_session(session: Annotated[dict, Depends(require_session)]):
    form = store.load_form(session["form_id"]) or {}
    return JSONResponse(session_summary(session, form))


@router.get("/{session_id}/resume")
async def resume_session(session: Annotated[dict, Depends(require_session)]):
    form = store.load_form(session["form_id"])
    if not form:
        raise HTTPException(404, "Form not found")
    if session.get("status") in ("completed", "filled"):
        raise HTTPException(400, "This session is already completed. Start a new one.")
    filled, total = progress(session, form)
    next_field = None
    for f in form.get("fields", []):
        if f.get("is_required"):
            val = session["collected"].get(f["field_name"])
            if val in (None, "", "N/A"):
                next_field = {
                    "field_name": f["field_name"],
                    "semantic_label": f["semantic_label"],
                }
                break
    return JSONResponse({
        "session_id": session["session_id"],
        "form_id": session["form_id"],
        "form_title": form.get("form_title", ""),
        "status": session["status"],
        "chat_history": session.get("chat_history", []),
        "collected": session.get("collected", {}),
        "progress_pct": round(filled / total * 100) if total else 0,
        "filled_fields": filled,
        "total_fields": total,
        "lang": session.get("lang", "en"),
        "next_field": next_field,
    })

