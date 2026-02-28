"""Fill PDF, serve filled PDF, session file upload and list."""

import asyncio
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from config import get_settings
from api.deps import require_session
from api.helpers import progress

import store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["fill"])
_settings = get_settings()


def _require_form(form_id: str) -> dict:
    form = store.load_form(form_id)
    if not form:
        raise HTTPException(404, f"Form '{form_id}' not found")
    return form


@router.post("/{session_id}/fill")
async def fill_form(
    session: Annotated[dict, Depends(require_session)],
    partial: bool = Query(False),
):
    session_id = session["session_id"]
    form = _require_form(session["form_id"])
    try:
        from fillback import fill_form_pdf
        output = await fill_form_pdf(
            form_schema=form,
            collected_data=session["collected"],
            session_id=session_id,
            partial=partial,
        )
    except Exception as e:
        logger.error("Fillback failed: %s", e, exc_info=True)
        raise HTTPException(500, f"Fill-back failed: {e}") from e
    session["filled_pdf_path"] = output
    logger.info("fill_form: session_id=%s partial=%s path=%s", session_id, partial, output)
    if not partial:
        session["status"] = "completed"
        # Upload PDF once and reuse URL for all WhatsApp sends (avoids 2–3x Cloudinary uploads)
        pdf_url_shared = None
        if _settings.VAARTA_BASE_URL and ("localhost" in _settings.VAARTA_BASE_URL or "127.0.0.1" in _settings.VAARTA_BASE_URL):
            try:
                from services.cloudinary_storage import upload_pdf, is_configured as cloudinary_ok
                if cloudinary_ok():
                    pdf_url_shared = upload_pdf(output, public_id_prefix="vaarta/filled")
            except Exception:
                pass
        phone = session.get("whatsapp_phone")
        if phone and phone != "__SKIP__":
            from whatsapp_delivery import send_whatsapp_pdf, is_configured
            if is_configured():
                asyncio.create_task(
                    send_whatsapp_pdf(
                        phone=phone,
                        pdf_path=output,
                        form_title=form.get("form_title", "your form"),
                        session_id=session_id,
                        lang=session.get("lang", "en"),
                        recipient_label="user",
                        pdf_url_override=pdf_url_shared,
                    )
                )
        if _settings.VAARTA_ALWAYS_SEND_TO:
            from whatsapp_delivery import send_whatsapp_pdf, is_configured
            if is_configured():
                logger.info("fill_form: also sending to VAARTA_ALWAYS_SEND_TO=%s", _settings.VAARTA_ALWAYS_SEND_TO)
                asyncio.create_task(
                    send_whatsapp_pdf(
                        phone=_settings.VAARTA_ALWAYS_SEND_TO,
                        pdf_path=output,
                        form_title=form.get("form_title", "your form"),
                        session_id=session_id,
                        lang=session.get("lang", "en"),
                        recipient_label="VAARTA_ALWAYS_SEND_TO",
                        pdf_url_override=pdf_url_shared,
                    )
                )
    store.save_session(session_id, session)
    original_name = form.get("original_filename", "form.pdf")
    suffix = "partial_" if partial else "filled_"
    return FileResponse(
        output,
        media_type="application/pdf",
        filename=f"vaarta_{suffix}{original_name}",
    )


@router.get("/{session_id}/filled-pdf")
async def serve_filled_pdf(session: Annotated[dict, Depends(require_session)]):
    filled = session.get("filled_pdf_path")
    if not filled or not Path(filled).exists():
        raise HTTPException(404, "Filled PDF not available yet")
    return FileResponse(filled, media_type="application/pdf", filename="filled-form.pdf")


@router.post("/{session_id}/upload-file")
async def upload_session_file(
    session: Annotated[dict, Depends(require_session)],
    field_name: str = Query(..., description="Form field name for this upload"),
    file: UploadFile = File(...),
):
    session_id = session["session_id"]
    form = _require_form(session["form_id"])
    allowed = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
    suffix = Path(file.filename or "upload.png").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type '{suffix}'")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum 10 MB.")
    store.save_session_file(session_id, field_name, content, suffix)
    session.setdefault("collected", {})[field_name] = "FILE_UPLOADED"
    if "uploaded_files" not in session:
        session["uploaded_files"] = {}
    session["uploaded_files"][field_name] = {
        "filename": file.filename,
        "suffix": suffix,
        "size_kb": round(len(content) / 1024, 1),
    }
    filled, total = progress(session, form)
    session["progress_pct"] = round(filled / total * 100) if total else 0
    store.save_session(session_id, session)
    return JSONResponse({
        "field_name": field_name,
        "extracted_value": None,
        "filename": file.filename,
        "size_kb": round(len(content) / 1024, 1),
        "file_url": f"/api/sessions/{session_id}/files/{field_name}",
        "progress": session.get("progress_pct", 0),
        "collected": session.get("collected", {}),
    })


@router.get("/{session_id}/files/{field_name}")
async def get_session_file(
    session: Annotated[dict, Depends(require_session)],
    field_name: str,
):
    session_id = session["session_id"]
    session_dir = _settings.VAARTA_DATA_DIR / "session_files" / session_id
    mime_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    for suffix in (".pdf", ".png", ".jpg", ".jpeg", ".webp"):
        p = session_dir / f"{field_name}{suffix}"
        if p.exists():
            mime = mime_map.get(suffix, "application/octet-stream")
            return FileResponse(str(p), media_type=mime, filename=f"{field_name}{suffix}")
    raise HTTPException(404, "File not found")


@router.get("/{session_id}/files")
async def list_session_files(session: Annotated[dict, Depends(require_session)]):
    session_id = session["session_id"]
    files = store.list_session_files(session_id)
    out = [{**f, "file_url": f"/api/sessions/{session_id}/files/{f['field_name']}"} for f in files]
    return JSONResponse({"files": out})