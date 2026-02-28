"""Form CRUD, upload, re-extract, preview, sample values, health, sessions, analytics."""

import json
import logging
import os
import tempfile
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from config import get_settings
from api.deps import require_form
from api.helpers import session_summary
from schemas.requests import FormUpdate, SampleValuesRequest

import store
from extractor import FormExtractor, ExtractionResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/forms", tags=["forms"])
extractor = FormExtractor()


def _fields_list_from_result(result: ExtractionResult) -> list:
    fields_list = []
    for f in result.fields:
        fd = (
            f
            if isinstance(f, dict)
            else {
                "field_name": f.field_name,
                "field_type": f.field_type,
                "semantic_label": f.semantic_label,
                "question_template": f.question_template,
                "description": f.description,
                "is_required": f.is_required,
                "data_type": f.data_type,
                "validation_rules": f.validation_rules,
                "purpose": f.purpose,
                "bounding_box": {
                    "xmin": f.bounding_box.xmin,
                    "ymin": f.bounding_box.ymin,
                    "xmax": f.bounding_box.xmax,
                    "ymax": f.bounding_box.ymax,
                },
                "acro_field_name": f.acro_field_name,
                "options": f.options,
                "children": getattr(f, "children", None),
            }
        )
        fields_list.append(fd)
    return fields_list


@router.post("/upload")
async def upload_form(file: UploadFile = File(...)):
    settings = get_settings()
    allowed = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff"}
    suffix = Path(file.filename or "form.pdf").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type '{suffix}'. Allowed: {allowed}")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum 20 MB.")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        logger.info("Extracting: %s (%.1f KB)", file.filename, len(content) / 1024)
        result: ExtractionResult = extractor.extract(tmp_path)
    except Exception as e:
        logger.error("Extraction error: %s", e, exc_info=True)
        raise HTTPException(500, f"Field extraction failed: {e}") from e
    finally:
        os.unlink(tmp_path)

    form_id = str(uuid.uuid4())
    base_url = settings.BASE_URL
    fields_list = _fields_list_from_result(result)
    sample_values = getattr(result, "sample_values", None) or {}

    from health_score import compute_health_score
    health = compute_health_score(fields_list)
    form_data = {
        "form_id": form_id,
        "form_title": result.form_title,
        "source_type": result.source_type,
        "page_count": result.page_count,
        "page_width": result.page_width,
        "page_height": result.page_height,
        "original_filename": file.filename,
        "uploaded_at": datetime.utcnow().isoformat(),
        "fields": fields_list,
        "warnings": result.warnings,
        "raw_image_b64": result.raw_image_b64,
        "sample_values": sample_values,
        "health_score": health,
    }
    store.save_form(form_id, form_data)
    store.save_original(form_id, content, suffix)

    return JSONResponse({
        "form_id": form_id,
        "form_title": result.form_title,
        "source_type": result.source_type,
        "page_count": result.page_count,
        "field_count": len(fields_list),
        "fields": fields_list,
        "warnings": result.warnings,
        "preview_image": f"data:image/png;base64,{result.raw_image_b64}" if result.raw_image_b64 else None,
        "chat_link": f"{base_url}/chat/{form_id}",
        "whatsapp_link": f"https://wa.me/?text={form_id}",
        "health_score": health,
    })


@router.post("/{form_id}/re-extract")
async def re_extract_form(form: Annotated[dict, Depends(require_form)]):
    form_id = form["form_id"]
    orig = store.original_path(form_id)
    if not orig or not orig.exists():
        raise HTTPException(404, "Original file not found. Re-upload the form to re-extract.")
    try:
        result: ExtractionResult = extractor.extract(str(orig))
    except Exception as e:
        logger.error("Re-extract error: %s", e, exc_info=True)
        raise HTTPException(500, f"Field extraction failed: {e}") from e

    fields_list = _fields_list_from_result(result)
    sample_values = getattr(result, "sample_values", None) or {}
    from health_score import compute_health_score
    health = compute_health_score(fields_list)
    form["fields"] = fields_list
    form["form_title"] = result.form_title
    form["source_type"] = result.source_type
    form["page_count"] = result.page_count
    form["page_width"] = result.page_width
    form["page_height"] = result.page_height
    form["raw_image_b64"] = result.raw_image_b64
    form["warnings"] = result.warnings
    form["sample_values"] = sample_values
    form["health_score"] = health
    store.save_form(form_id, form)

    return JSONResponse({
        "form_id": form_id,
        "form_title": form["form_title"],
        "field_count": len(fields_list),
        "fields": fields_list,
        "warnings": result.warnings,
        "preview_image": f"data:image/png;base64,{result.raw_image_b64}" if result.raw_image_b64 else None,
        "health_score": health,
    })


@router.get("/{form_id}")
async def get_form(form: Annotated[dict, Depends(require_form)]):
    return JSONResponse({k: v for k, v in form.items() if k != "raw_image_b64"})


@router.delete("/{form_id}")
async def delete_form(form_id: str, form: Annotated[dict, Depends(require_form)]):
    ok = store.delete_form(form_id)
    if not ok:
        raise HTTPException(500, "Failed to delete form")
    return JSONResponse({"deleted": form_id}, status_code=200)


@router.get("/{form_id}/preview")
async def get_form_preview(form: Annotated[dict, Depends(require_form)]):
    img = form.get("raw_image_b64")
    if not img:
        raise HTTPException(404, "No preview available")
    return JSONResponse({"preview_image": f"data:image/png;base64,{img}"})


@router.post("/{form_id}/sample-values")
async def generate_sample_values(
    body: Optional[SampleValuesRequest] = None,
    form: Annotated[dict, Depends(require_form)] = None,
):
    form_id = form["form_id"]
    fields = (body and body.fields) or form.get("fields", [])
    if not fields:
        return JSONResponse({"sample_values": {}})
    field_specs = []
    for f in fields:
        fd = f if isinstance(f, dict) else f
        name = fd.get("field_name", "")
        label = fd.get("semantic_label", name)
        ftype = fd.get("field_type", "text")
        field_specs.append({"field_name": name, "label": label, "type": ftype})
    settings = get_settings()
    try:
        from openai import AsyncOpenAI
        ai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        prompt = (
            "You are helping fill a form with realistic, relatable synthetic data for a live preview. "
            "Given the list of form fields below, output exactly one short, realistic sample value per field. "
            "Use Indian context where appropriate: Indian names (e.g. Rahul Sharma, Priya Patel), "
            "Indian dates (DD/MM/YYYY or 15-Mar-1990), phone with +91, plausible addresses. "
            "For PAN use format ABCDE1234F. For Aadhaar use 12 digits. "
            "For checkbox use 'Yes' or 'No'. For email use a realistic-looking address. Keep text brief.\n\n"
            "Fields:\n"
            + "\n".join(
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
        logger.warning("Sample values fallback: %s", e)
        fallback = {
            "text": "Sample text",
            "number": "42",
            "email": "user@example.com",
            "date": "15/03/1990",
            "checkbox": "Yes",
            "radio": "Option 1",
            "select": "First option",
            "textarea": "A short sample answer.",
            "signature": "✓",
        }
        out = {s["field_name"]: fallback.get(s["type"], "—") for s in field_specs}
        store.update_form_sample_values(form_id, out)
        return JSONResponse({"sample_values": out})


@router.patch("/{form_id}")
async def update_form(
    body: FormUpdate,
    form: Annotated[dict, Depends(require_form)] = None,
):
    form_id = form["form_id"]
    ok = store.update_form_fields(form_id, body.fields, body.form_title)
    if not ok:
        raise HTTPException(404, "Form not found")
    return JSONResponse({"status": "saved", "field_count": len(body.fields)})


@router.get("/{form_id}/health")
async def get_form_health(form: Annotated[dict, Depends(require_form)] = None):
    form_id = form["form_id"]
    stored = form.get("health_score")
    if stored:
        return JSONResponse(stored)
    from health_score import compute_health_score
    health = compute_health_score(form.get("fields", []))
    store.update_form_health_score(form_id, health)
    return JSONResponse(health)


@router.get("/{form_id}/sessions")
async def get_form_sessions(form: Annotated[dict, Depends(require_form)] = None):
    form_id = form["form_id"]
    form_data = store.load_form(form_id) or form
    sessions = store.list_sessions_for_form(form_id)
    return JSONResponse({"sessions": [session_summary(s, form_data) for s in sessions]})


@router.get("/{form_id}/analytics")
async def get_form_analytics(form: Annotated[dict, Depends(require_form)] = None):
    from api.helpers import progress
    form_id = form["form_id"]
    form_data = store.load_form(form_id) or form
    sessions = store.list_sessions_for_form(form_id)
    fields = form_data.get("fields", [])
    if not sessions:
        return JSONResponse({
            "total_sessions": 0,
            "completed_sessions": 0,
            "completion_rate": 0,
            "avg_completion_time_seconds": None,
            "language_distribution": {},
            "field_analytics": [],
            "funnel": [],
        })
    total = len(sessions)
    completed = sum(1 for s in sessions if s.get("status") in ("completed", "filled"))
    languages = Counter(s.get("lang", "en") for s in sessions)
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
                    if 0 < delta < 7200:
                        completion_times.append(delta)
                except (ValueError, TypeError):
                    pass
    field_analytics = []
    funnel = []
    for i, field in enumerate(fields):
        fname = field["field_name"]
        label = field["semantic_label"]
        reached = 0
        filled_count = 0
        skipped_count = 0
        for s in sessions:
            collected = s.get("collected", {})
            val = collected.get(fname)
            if val is not None and val != "":
                if val == "SKIPPED":
                    skipped_count += 1
                else:
                    filled_count += 1
                reached += 1
            else:
                later_fields = [f["field_name"] for f in fields[i + 1 :]]
                if any(collected.get(lf) not in (None, "", "SKIPPED") for lf in later_fields):
                    reached += 1
        abandonment_count = sum(
            1
            for s in sessions
            if s.get("last_asked_field") == fname
            and s.get("status") not in ("completed", "filled")
        )
        fill_rate = round(filled_count / reached * 100) if reached else 0
        field_analytics.append({
            "field_name": fname,
            "semantic_label": label,
            "field_type": field.get("field_type", "text"),
            "is_required": field.get("is_required", False),
            "reached": reached,
            "filled": filled_count,
            "skipped": skipped_count,
            "abandoned_here": abandonment_count,
            "fill_rate_pct": fill_rate,
            "drop_off_pct": 100 - fill_rate if reached else 0,
        })
        funnel.append({
            "field": label,
            "pct": round(filled_count / total * 100) if total else 0,
            "count": filled_count,
        })
    return JSONResponse({
        "total_sessions": total,
        "completed_sessions": completed,
        "completion_rate": round(completed / total * 100) if total else 0,
        "avg_completion_time_seconds": round(sum(completion_times) / len(completion_times))
        if completion_times
        else None,
        "language_distribution": dict(languages),
        "field_analytics": field_analytics,
        "funnel": funnel,
    })
