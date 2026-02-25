"""
FormBot Backend API
Endpoints for form extraction, session management, and form fill-back
"""

import os
import uuid
import json
import base64
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import asdict

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from extractor import FormExtractor, ExtractionResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FormBot API", version="1.0.0")

# Allow all origins in dev (tighten in prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory session store (replace with Redis/Supabase in prod) ──
sessions: dict[str, dict] = {}

extractor = FormExtractor()


# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────

class SessionCreate(BaseModel):
    form_id: str
    agent_id: Optional[str] = None

class ChatMessage(BaseModel):
    session_id: str
    message: str
    is_voice: bool = False

class FillbackRequest(BaseModel):
    session_id: str


# ─────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ─────────────────────────────────────────────
# Form Upload & Field Extraction
# ─────────────────────────────────────────────

@app.post("/api/forms/upload")
async def upload_form(file: UploadFile = File(...)):
    """
    Upload a form (PDF or image). Returns extracted fields + form_id.
    
    This is the CORE endpoint. Agent uploads → we extract → return schema.
    
    Response includes:
    - form_id: unique ID for this form
    - form_title: detected title
    - source_type: acroform | scanned_image | image_pdf  
    - fields: list of detected fields with labels, types, bounding boxes
    - preview_image: base64 PNG for UI display
    - chat_link: shareable link for the user-facing chatbot
    """
    # Validate file type
    allowed = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff"}
    suffix = Path(file.filename).suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type: {suffix}. Use: {allowed}")

    # Save to temp file (extractor needs file path)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        logger.info(f"Extracting fields from: {file.filename} ({len(content)/1024:.1f} KB)")
        result: ExtractionResult = extractor.extract(tmp_path)
    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)
        raise HTTPException(500, f"Field extraction failed: {str(e)}")
    finally:
        os.unlink(tmp_path)

    # Store form in session store
    form_id = str(uuid.uuid4())
    form_data = result.to_dict()
    form_data["form_id"] = form_id
    form_data["original_filename"] = file.filename
    form_data["uploaded_at"] = datetime.utcnow().isoformat()

    sessions[f"form:{form_id}"] = form_data

    # Build response (don't send full base64 in field list — keep it clean)
    fields_out = []
    for f in result.fields:
        bbox = f["bounding_box"] if isinstance(f, dict) else f.bounding_box
        if hasattr(bbox, "__dataclass_fields__"):
            bbox = asdict(bbox)
        fields_out.append({
            "field_name": f["field_name"] if isinstance(f, dict) else f.field_name,
            "field_type": f["field_type"] if isinstance(f, dict) else f.field_type,
            "semantic_label": f["semantic_label"] if isinstance(f, dict) else f.semantic_label,
            "question_template": f["question_template"] if isinstance(f, dict) else f.question_template,
            "description": f["description"] if isinstance(f, dict) else f.description,
            "is_required": f["is_required"] if isinstance(f, dict) else f.is_required,
            "data_type": f["data_type"] if isinstance(f, dict) else f.data_type,
            "bounding_box": bbox,
        })

    base_url = os.environ.get("BASE_URL", "http://localhost:3000")

    return JSONResponse({
        "form_id": form_id,
        "form_title": result.form_title,
        "source_type": result.source_type,
        "page_count": result.page_count,
        "field_count": len(result.fields),
        "fields": fields_out,
        "warnings": result.warnings,
        "preview_image": f"data:image/png;base64,{result.raw_image_b64}" if result.raw_image_b64 else None,
        "chat_link": f"{base_url}/chat/{form_id}",
        "whatsapp_link": f"https://wa.me/{os.environ.get('TWILIO_WA_NUMBER', '')}?text=START:{form_id}",
    })


@app.get("/api/forms/{form_id}")
async def get_form(form_id: str):
    """Get form schema by ID (for chat UI to load)."""
    form = sessions.get(f"form:{form_id}")
    if not form:
        raise HTTPException(404, "Form not found")
    return JSONResponse(form)


@app.get("/api/forms/{form_id}/preview")
async def get_form_preview(form_id: str):
    """Return base64 preview image for the form."""
    form = sessions.get(f"form:{form_id}")
    if not form:
        raise HTTPException(404, "Form not found")
    img_b64 = form.get("raw_image_b64")
    if not img_b64:
        raise HTTPException(404, "No preview image available")
    return JSONResponse({"preview_image": f"data:image/png;base64,{img_b64}"})


# ─────────────────────────────────────────────
# Session Management (Chat Sessions)
# ─────────────────────────────────────────────

@app.post("/api/sessions/create")
async def create_session(data: SessionCreate):
    """
    Create a chat session linked to a form.
    Called when user opens the chat link.
    """
    form = sessions.get(f"form:{data.form_id}")
    if not form:
        raise HTTPException(404, "Form not found")

    session_id = str(uuid.uuid4())
    sessions[f"session:{session_id}"] = {
        "session_id": session_id,
        "form_id": data.form_id,
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",  # active | completed | abandoned
        "collected": {},     # field_name → value
        "chat_history": [],  # OpenAI message format
        "progress": 0,       # 0-100
    }

    return JSONResponse({
        "session_id": session_id,
        "form_title": form.get("form_title"),
        "field_count": len(form.get("fields", [])),
    })


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Get current session state (for agent dashboard live view)."""
    session = sessions.get(f"session:{session_id}")
    if not session:
        raise HTTPException(404, "Session not found")
    
    form = sessions.get(f"form:{session['form_id']}")
    total_fields = len(form.get("fields", [])) if form else 0
    filled_fields = len([v for v in session["collected"].values() if v and v != "N/A"])
    
    return JSONResponse({
        **session,
        "total_fields": total_fields,
        "filled_fields": filled_fields,
        "progress_pct": round(filled_fields / total_fields * 100) if total_fields else 0,
        "chat_history": session["chat_history"],  # Don't expose raw OpenAI format to client — just send it for now
    })


@app.get("/api/forms/{form_id}/sessions")
async def get_form_sessions(form_id: str):
    """Get all sessions for a form (agent dashboard)."""
    form_sessions = []
    for key, val in sessions.items():
        if key.startswith("session:") and val.get("form_id") == form_id:
            form = sessions.get(f"form:{form_id}", {})
            total = len(form.get("fields", []))
            filled = len([v for v in val["collected"].values() if v and v != "N/A"])
            form_sessions.append({
                "session_id": val["session_id"],
                "created_at": val["created_at"],
                "status": val["status"],
                "progress_pct": round(filled / total * 100) if total else 0,
                "filled_fields": filled,
                "total_fields": total,
            })
    return JSONResponse({"sessions": form_sessions})


# ─────────────────────────────────────────────
# Chat Endpoint (Conversation Engine)
# ─────────────────────────────────────────────

@app.post("/api/chat")
async def chat(msg: ChatMessage):
    """
    Main chat endpoint. Receives user message → returns bot reply + extracted data.
    Uses your existing OpenAI prompt setup (SYSTEM_PROMPT + EXTRACT_TOOL_DEFINITION).
    """
    session = sessions.get(f"session:{msg.session_id}")
    if not session:
        raise HTTPException(404, "Session not found")

    form = sessions.get(f"form:{session['form_id']}")
    if not form:
        raise HTTPException(404, "Form not found")

    try:
        from chat_engine import run_chat_turn
        result = await run_chat_turn(
            user_message=msg.message,
            session=session,
            form_schema=form,
        )

        # Update session
        session["collected"].update(result.get("extracted", {}))
        session["chat_history"] = result["updated_history"]
        if result.get("is_complete"):
            session["status"] = "completed"

        # Calculate progress
        total = len(form.get("fields", []))
        filled = len([v for v in session["collected"].values() if v and v != "N/A"])
        session["progress"] = round(filled / total * 100) if total else 0

        return JSONResponse({
            "reply": result["reply"],
            "extracted": result.get("extracted", {}),
            "is_complete": result.get("is_complete", False),
            "progress": session["progress"],
            "collected": session["collected"],
        })

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(500, f"Chat error: {str(e)}")


# ─────────────────────────────────────────────
# Form Fill-back
# ─────────────────────────────────────────────

@app.post("/api/sessions/{session_id}/fill")
async def fill_form(session_id: str, background_tasks: BackgroundTasks):
    """
    Fill the original form with collected data.
    Returns filled PDF for download.
    AcroForm PDFs → filled natively.
    Image-based → text overlay rendered.
    """
    session = sessions.get(f"session:{session_id}")
    if not session:
        raise HTTPException(404, "Session not found")

    form = sessions.get(f"form:{session['form_id']}")
    if not form:
        raise HTTPException(404, "Form not found")

    try:
        from fillback import fill_form_pdf
        output_path = await fill_form_pdf(
            form_schema=form,
            collected_data=session["collected"],
            session_id=session_id,
        )

        session["status"] = "filled"
        session["filled_pdf_path"] = output_path

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=f"filled_{form.get('original_filename', 'form.pdf')}",
        )
    except Exception as e:
        logger.error(f"Fill-back failed: {e}", exc_info=True)
        raise HTTPException(500, f"Fill-back failed: {str(e)}")


# ─────────────────────────────────────────────
# Agent Dashboard Data
# ─────────────────────────────────────────────

@app.get("/api/agent/forms")
async def list_agent_forms(agent_id: Optional[str] = None):
    """List all forms uploaded (agent dashboard)."""
    forms = []
    for key, val in sessions.items():
        if key.startswith("form:"):
            form_id = val.get("form_id")
            # Count sessions for this form
            session_count = sum(
                1 for k, v in sessions.items()
                if k.startswith("session:") and v.get("form_id") == form_id
            )
            completed = sum(
                1 for k, v in sessions.items()
                if k.startswith("session:") and v.get("form_id") == form_id
                and v.get("status") == "completed"
            )
            forms.append({
                "form_id": form_id,
                "form_title": val.get("form_title"),
                "original_filename": val.get("original_filename"),
                "uploaded_at": val.get("uploaded_at"),
                "source_type": val.get("source_type"),
                "field_count": len(val.get("fields", [])),
                "session_count": session_count,
                "completed_count": completed,
            })
    return JSONResponse({"forms": sorted(forms, key=lambda x: x["uploaded_at"], reverse=True)})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
