"""
Vaarta Backend API — v3.0
New in this version:
  - Language auto-switch persisted from chat engine's detected_lang
  - Drop-off analytics: tracks last_asked_field per turn
  - GET /api/forms/{form_id}/analytics — field-level drop-off stats
  - GET /api/sessions/{session_id}/resume — session resume data for "Continue later"
"""

import json
import logging
import os
import tempfile
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import store
from extractor import FormExtractor, ExtractionResult

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Vaarta API", version="3.0.0", docs_url="/docs")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

extractor = FormExtractor()


# ─────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────

class SessionCreate(BaseModel):
    form_id: str

class ChatMessage(BaseModel):
    session_id: str
    message: str
    lang: str = "en"

class ChatOpen(BaseModel):
    session_id: str
    lang: str = "en"

class FormUpdate(BaseModel):
    fields: list
    form_title: str

class SampleValuesRequest(BaseModel):
    fields: Optional[list] = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _require_form(form_id: str) -> dict:
    form = store.load_form(form_id)
    if not form:
        raise HTTPException(404, f"Form '{form_id}' not found")
    return form

def _require_session(session_id: str) -> dict:
    session = store.load_session(session_id)
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found")
    return session

def _progress(session: dict, form: dict) -> tuple[int, int]:
    total  = len(form.get("fields", []))
    filled = len([
        v for v in session.get("collected", {}).values()
        if v not in (None, "", "N/A", "SKIPPED")
    ])
    filled = min(filled, total) if total else 0
    return filled, total

def _session_summary(session: dict, form: dict) -> dict:
    filled, total = _progress(session, form)
    return {
        "session_id":    session["session_id"],
        "form_id":       session["form_id"],
        "created_at":    session["created_at"],
        "status":        session["status"],
        "progress_pct":  round(filled / total * 100) if total else 0,
        "filled_fields": filled,
        "total_fields":  total,
        "collected":     session.get("collected", {}),
        "lang":          session.get("lang", "en"),
    }


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "version": "3.0.0"}


# ─────────────────────────────────────────────
# Forms — Upload
# ─────────────────────────────────────────────

@app.post("/api/forms/upload")
async def upload_form(file: UploadFile = File(...)):
    allowed = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff"}
    suffix  = Path(file.filename or "form.pdf").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type '{suffix}'. Allowed: {allowed}")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum 20 MB.")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        logger.info(f"Extracting: {file.filename} ({len(content)/1024:.1f} KB)")
        result: ExtractionResult = extractor.extract(tmp_path)
    except Exception as e:
        logger.error(f"Extraction error: {e}", exc_info=True)
        raise HTTPException(500, f"Field extraction failed: {e}")
    finally:
        os.unlink(tmp_path)

    form_id  = str(uuid.uuid4())
    base_url = os.environ.get("BASE_URL", "http://localhost:3000")

    fields_list = []
    for f in result.fields:
        fd = f if isinstance(f, dict) else {
            "field_name":        f.field_name,
            "field_type":        f.field_type,
            "semantic_label":    f.semantic_label,
            "question_template": f.question_template,
            "description":       f.description,
            "is_required":       f.is_required,
            "data_type":         f.data_type,
            "validation_rules":  f.validation_rules,
            "purpose":           f.purpose,
            "bounding_box":      {"xmin": f.bounding_box.xmin, "ymin": f.bounding_box.ymin,
                                  "xmax": f.bounding_box.xmax, "ymax": f.bounding_box.ymax},
            "acro_field_name":   f.acro_field_name,
            "options":           f.options,
        }
        fields_list.append(fd)

    sample_values = getattr(result, "sample_values", None) or {}
    form_data = {
        "form_id":           form_id,
        "form_title":        result.form_title,
        "source_type":       result.source_type,
        "page_count":        result.page_count,
        "page_width":        result.page_width,
        "page_height":       result.page_height,
        "original_filename": file.filename,
        "uploaded_at":       datetime.utcnow().isoformat(),
        "fields":            fields_list,
        "warnings":          result.warnings,
        "raw_image_b64":     result.raw_image_b64,
        "sample_values":     sample_values,
    }

    store.save_form(form_id, form_data)
    store.save_original(form_id, content, suffix)

    return JSONResponse({
        "form_id":       form_id,
        "form_title":    result.form_title,
        "source_type":   result.source_type,
        "page_count":    result.page_count,
        "field_count":   len(fields_list),
        "fields":        fields_list,
        "warnings":      result.warnings,
        "preview_image": f"data:image/png;base64,{result.raw_image_b64}" if result.raw_image_b64 else None,
        "chat_link":     f"{base_url}/chat/{form_id}",
        "whatsapp_link": f"https://wa.me/?text={form_id}",
    })


# ─────────────────────────────────────────────
# Forms — Read & Update
# ─────────────────────────────────────────────

@app.get("/api/forms/{form_id}")
async def get_form(form_id: str):
    form = _require_form(form_id)
    return JSONResponse({k: v for k, v in form.items() if k != "raw_image_b64"})


@app.get("/api/forms/{form_id}/preview")
async def get_form_preview(form_id: str):
    form = _require_form(form_id)
    img  = form.get("raw_image_b64")
    if not img:
        raise HTTPException(404, "No preview available")
    return JSONResponse({"preview_image": f"data:image/png;base64,{img}"})


@app.post("/api/forms/{form_id}/sample-values")
async def generate_sample_values(form_id: str, body: Optional[SampleValuesRequest] = None):
    form   = _require_form(form_id)
    fields = (body and body.fields) or form.get("fields", [])
    if not fields:
        return JSONResponse({"sample_values": {}})

    field_specs = []
    for f in fields:
        fd    = f if isinstance(f, dict) else f
        name  = fd.get("field_name", "")
        label = fd.get("semantic_label", name)
        ftype = fd.get("field_type", "text")
        field_specs.append({"field_name": name, "label": label, "type": ftype})

    try:
        from openai import AsyncOpenAI
        ai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        prompt = (
            "You are helping fill a form with realistic, relatable synthetic data for a live preview. "
            "Given the list of form fields below, output exactly one short, realistic sample value per field. "
            "Use Indian context where appropriate: Indian names (e.g. Rahul Sharma, Priya Patel), "
            "Indian dates (DD/MM/YYYY or 15-Mar-1990), phone with +91, plausible addresses. "
            "For PAN use format ABCDE1234F. For Aadhaar use 12 digits. "
            "For checkbox use 'Yes' or 'No'. For email use a realistic-looking address. Keep text brief.\n\n"
            "Fields:\n" + "\n".join(
                f"- {s['field_name']} (label: {s['label']}, type: {s['type']})"
                for s in field_specs
            )
            + "\n\nOutput valid JSON only, no markdown, one object: keys = field_name, value = sample string."
        )
        resp = await ai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1024,
        )
        text = (resp.choices[0].message.content or "").strip()
        if "```" in text:
            text = text.split("```")[1].replace("json", "").strip()
        sample_values = json.loads(text)
        out = {s["field_name"]: sample_values.get(s["field_name"], "") for s in field_specs}
        store.update_form_sample_values(form_id, out)
        return JSONResponse({"sample_values": out})
    except Exception as e:
        logger.warning(f"Sample values fallback: {e}")
        fallback = {
            "text": "Sample text", "number": "42", "email": "user@example.com",
            "date": "15/03/1990", "checkbox": "Yes", "radio": "Option 1",
            "select": "First option", "textarea": "A short sample answer.", "signature": "✓",
        }
        out = {s["field_name"]: fallback.get(s["type"], "—") for s in field_specs}
        store.update_form_sample_values(form_id, out)
        return JSONResponse({"sample_values": out})


@app.patch("/api/forms/{form_id}")
async def update_form(form_id: str, body: FormUpdate):
    ok = store.update_form_fields(form_id, body.fields, body.form_title)
    if not ok:
        raise HTTPException(404, "Form not found")
    return JSONResponse({"status": "saved", "field_count": len(body.fields)})


@app.get("/api/agent/forms")
async def list_forms():
    forms = store.list_forms()
    out   = []
    for form in forms:
        form_id  = form.get("form_id", "")
        sessions = store.list_sessions_for_form(form_id)
        completed = sum(1 for s in sessions if s.get("status") in ("completed", "filled"))
        out.append({
            "form_id":           form_id,
            "form_title":        form.get("form_title", ""),
            "original_filename": form.get("original_filename", ""),
            "uploaded_at":       form.get("uploaded_at", ""),
            "source_type":       form.get("source_type", ""),
            "field_count":       len(form.get("fields", [])),
            "session_count":     len(sessions),
            "completed_count":   completed,
        })
    return JSONResponse({"forms": out})


@app.get("/api/forms/{form_id}/sessions")
async def get_form_sessions(form_id: str):
    _require_form(form_id)
    form     = store.load_form(form_id)
    sessions = store.list_sessions_for_form(form_id)
    return JSONResponse({"sessions": [_session_summary(s, form) for s in sessions]})


# ─────────────────────────────────────────────
# Analytics — Drop-off per field
# ─────────────────────────────────────────────

@app.get("/api/forms/{form_id}/analytics")
async def get_form_analytics(form_id: str):
    """
    Returns field-level drop-off analytics:
    - For each field: how many sessions reached it, how many filled it, drop-off rate
    - Average completion time
    - Language distribution
    - Completion funnel data for charts
    """
    form     = _require_form(form_id)
    sessions = store.list_sessions_for_form(form_id)
    fields   = form.get("fields", [])

    if not sessions:
        return JSONResponse({
            "total_sessions":    0,
            "completed_sessions": 0,
            "completion_rate":   0,
            "avg_completion_time_seconds": None,
            "language_distribution": {},
            "field_analytics":   [],
            "funnel":            [],
        })

    total      = len(sessions)
    completed  = sum(1 for s in sessions if s.get("status") in ("completed", "filled"))
    languages  = Counter(s.get("lang", "en") for s in sessions)

    # Average completion time (for completed sessions that have timestamps)
    completion_times = []
    for s in sessions:
        if s.get("status") in ("completed", "filled"):
            created = s.get("created_at")
            updated = s.get("updated_at") or s.get("created_at")
            if created and updated and created != updated:
                try:
                    delta = (
                        datetime.fromisoformat(updated) - datetime.fromisoformat(created)
                    ).total_seconds()
                    if 0 < delta < 7200:  # ignore outliers > 2 hrs
                        completion_times.append(delta)
                except (ValueError, TypeError):
                    pass

    # Field-level stats
    field_analytics = []
    funnel = []
    for i, field in enumerate(fields):
        fname = field["field_name"]
        label = field["semantic_label"]

        # "Reached" = sessions that have at least this many collected fields
        # (proxy: sessions where all previous required fields are filled)
        reached = 0
        filled_count  = 0
        skipped_count = 0
        dropoff_count = 0

        for s in sessions:
            collected = s.get("collected", {})
            # Was this field ever addressed?
            val = collected.get(fname)
            if val is not None and val != "":
                if val == "SKIPPED":
                    skipped_count += 1
                else:
                    filled_count += 1
                reached += 1
            else:
                # Check if they got past this field (reached but didn't fill)
                # Heuristic: if any later field is filled, they "reached" this one
                later_fields = [f["field_name"] for f in fields[i+1:]]
                got_past = any(
                    collected.get(lf) not in (None, "", "SKIPPED")
                    for lf in later_fields
                )
                if got_past:
                    reached += 1
                    dropoff_count += 1  # reached but didn't fill

        # Drop-off count = sessions that were abandoned on this field
        # (last_asked_field == fname in their session metadata)
        abandonment_count = sum(
            1 for s in sessions
            if s.get("last_asked_field") == fname
            and s.get("status") not in ("completed", "filled")
        )

        fill_rate = round(filled_count / reached * 100) if reached else 0

        field_stat = {
            "field_name":         fname,
            "semantic_label":     label,
            "field_type":         field.get("field_type", "text"),
            "is_required":        field.get("is_required", False),
            "reached":            reached,
            "filled":             filled_count,
            "skipped":            skipped_count,
            "abandoned_here":     abandonment_count,
            "fill_rate_pct":      fill_rate,
            "drop_off_pct":       100 - fill_rate if reached else 0,
        }
        field_analytics.append(field_stat)

        # Funnel: percentage of total sessions that filled each field
        funnel.append({
            "field":    label,
            "pct":      round(filled_count / total * 100) if total else 0,
            "count":    filled_count,
        })

    return JSONResponse({
        "total_sessions":             total,
        "completed_sessions":         completed,
        "completion_rate":            round(completed / total * 100) if total else 0,
        "avg_completion_time_seconds": round(sum(completion_times) / len(completion_times)) if completion_times else None,
        "language_distribution":      dict(languages),
        "field_analytics":            field_analytics,
        "funnel":                     funnel,
    })


# ─────────────────────────────────────────────
# Sessions
# ─────────────────────────────────────────────

@app.post("/api/sessions/create")
async def create_session(data: SessionCreate):
    form = _require_form(data.form_id)
    sid  = str(uuid.uuid4())
    session = {
        "session_id":       sid,
        "form_id":          data.form_id,
        "created_at":       datetime.utcnow().isoformat(),
        "status":           "active",
        "collected":        {},
        "chat_history":     [],
        "progress":         0,
        "lang":             "en",
        "last_asked_field": None,
    }
    store.save_session(sid, session)
    return JSONResponse({
        "session_id":  sid,
        "form_title":  form.get("form_title", ""),
        "field_count": len(form.get("fields", [])),
    })


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = _require_session(session_id)
    form    = store.load_form(session["form_id"]) or {}
    return JSONResponse(_session_summary(session, form))


@app.get("/api/sessions/{session_id}/resume")
async def resume_session(session_id: str):
    """
    Returns everything the chat UI needs to restore a saved session:
    - Full chat history (to re-render messages)
    - Current collected values (to show progress)
    - Progress percentage
    - Language preference
    - The next field to ask about (so the UI can show context)
    
    Usage: user opens /chat/[formId]?session=[sessionId]
    Frontend calls this instead of creating a new session.
    """
    session = _require_session(session_id)
    form    = _require_form(session["form_id"])

    if session.get("status") in ("completed", "filled"):
        raise HTTPException(400, "This session is already completed. Start a new one.")

    filled, total = _progress(session, form)

    # Find the next unfilled required field to show the user
    next_field = None
    for f in form.get("fields", []):
        if f.get("is_required"):
            val = session["collected"].get(f["field_name"])
            if val in (None, "", "N/A"):
                next_field = {
                    "field_name":    f["field_name"],
                    "semantic_label": f["semantic_label"],
                }
                break

    return JSONResponse({
        "session_id":   session_id,
        "form_id":      session["form_id"],
        "form_title":   form.get("form_title", ""),
        "status":       session["status"],
        "chat_history": session.get("chat_history", []),
        "collected":    session.get("collected", {}),
        "progress_pct": round(filled / total * 100) if total else 0,
        "filled_fields": filled,
        "total_fields":  total,
        "lang":          session.get("lang", "en"),
        "next_field":    next_field,
    })


# ─────────────────────────────────────────────
# Chat — Opening message
# ─────────────────────────────────────────────

@app.post("/api/chat/open")
async def chat_open(body: ChatOpen):
    session = _require_session(body.session_id)
    form    = _require_form(session["form_id"])

    from chat_engine import get_opening_message
    opening = await get_opening_message(form, lang=body.lang)

    session["chat_history"] = [{"role": "assistant", "content": opening}]
    session["lang"]         = body.lang
    store.save_session(body.session_id, session)

    return JSONResponse({"message": opening})


# ─────────────────────────────────────────────
# Chat — Main turn
# ─────────────────────────────────────────────

@app.post("/api/chat")
async def chat(msg: ChatMessage):
    session = _require_session(msg.session_id)
    form    = _require_form(session["form_id"])

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
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(500, f"Chat processing failed: {e}")

    # Merge extracted values
    for k, v in result.get("extracted", {}).items():
        existing = session["collected"].get(k)
        if v == "SKIPPED" and existing not in (None, "", "N/A"):
            continue
        session["collected"][k] = v

    session["chat_history"]  = result["updated_history"]
    session["updated_at"]    = datetime.utcnow().isoformat()

    # Persist language switch if detected
    if result.get("detected_lang"):
        session["lang"] = result["detected_lang"]
        lang            = result["detected_lang"]
    else:
        session["lang"] = lang

    # Track drop-off: store which field was being asked when the user last responded
    if result.get("last_asked_field"):
        session["last_asked_field"] = result["last_asked_field"]

    if result.get("is_complete"):
        session["status"] = "completed"

    filled, total        = _progress(session, form)
    session["progress"]  = round(filled / total * 100) if total else 0

    store.save_session(msg.session_id, session)

    return JSONResponse({
        "reply":         result["reply"],
        "extracted":     result.get("extracted", {}),
        "confirmations": result.get("confirmations", []),
        "is_complete":   result.get("is_complete", False),
        "progress":      session["progress"],
        "collected":     session["collected"],
        "lang":          session.get("lang", "en"),  # return current lang so UI can update
    })


# ─────────────────────────────────────────────
# Fill-back
# ─────────────────────────────────────────────

@app.post("/api/sessions/{session_id}/fill")
async def fill_form(session_id: str):
    session = _require_session(session_id)
    form    = _require_form(session["form_id"])

    try:
        from fillback import fill_form_pdf
        output = await fill_form_pdf(
            form_schema=form,
            collected_data=session["collected"],
            session_id=session_id,
        )
    except Exception as e:
        logger.error(f"Fillback failed: {e}", exc_info=True)
        raise HTTPException(500, f"Fill-back failed: {e}")

    session["status"]          = "completed"
    session["filled_pdf_path"] = output
    store.save_session(session_id, session)

    original_name = form.get("original_filename", "form.pdf")
    return FileResponse(
        output,
        media_type="application/pdf",
        filename=f"vaarta_filled_{original_name}",
    )


# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")