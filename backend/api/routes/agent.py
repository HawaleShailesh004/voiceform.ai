"""Agent dashboard: list all forms."""

import store
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/forms")
async def list_forms():
    forms = store.list_forms()
    out = []
    for form in forms:
        form_id = form.get("form_id", "")
        sessions = store.list_sessions_for_form(form_id)
        completed = sum(1 for s in sessions if s.get("status") in ("completed", "filled"))
        out.append({
            "form_id": form_id,
            "form_title": form.get("form_title", ""),
            "original_filename": form.get("original_filename", ""),
            "uploaded_at": form.get("uploaded_at", ""),
            "source_type": form.get("source_type", ""),
            "field_count": len(form.get("fields", [])),
            "session_count": len(sessions),
            "completed_count": completed,
            "health_score": form.get("health_score"),
        })
    return JSONResponse({"forms": out})
