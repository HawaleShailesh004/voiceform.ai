"""
Vaarta Persistence Layer
JSON-file backed store. Survives server restarts. Zero dependencies.
Structure on disk:
  data/
    forms/   {form_id}.json    — form schema + fields + preview
    originals/{form_id}.pdf    — original uploaded file for AcroForm fill-back
    sessions/{session_id}.json — chat session state
"""

import json
import logging
import os
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("VAARTA_DATA_DIR", "data"))
FORMS_DIR     = DATA_DIR / "forms"
ORIGINALS_DIR = DATA_DIR / "originals"
SESSIONS_DIR  = DATA_DIR / "sessions"
FILLED_DIR    = DATA_DIR / "filled"

for d in (FORMS_DIR, ORIGINALS_DIR, SESSIONS_DIR, FILLED_DIR):
    d.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()


# ── Internal helpers ───────────────────────────────────────────────────

def _read(path: Path) -> Optional[dict]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _write(path: Path, data: dict) -> None:
    with _lock:
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp.replace(path)


# ── Forms ──────────────────────────────────────────────────────────────

def save_form(form_id: str, data: dict) -> None:
    """Save form schema (fields, title, preview, metadata). Omits raw preview for speed."""
    _write(FORMS_DIR / f"{form_id}.json", data)


def load_form(form_id: str) -> Optional[dict]:
    return _read(FORMS_DIR / f"{form_id}.json")


def list_forms() -> list[dict]:
    forms = []
    for p in sorted(FORMS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        data = _read(p)
        if data:
            forms.append(data)
    return forms


def update_form_fields(form_id: str, fields: list, title: str) -> bool:
    """Update just the fields list and title — called by the field editor."""
    data = load_form(form_id)
    if not data:
        return False
    data["fields"] = fields
    data["form_title"] = title
    save_form(form_id, data)
    return True


def update_form_sample_values(form_id: str, sample_values: dict) -> bool:
    """Save generated sample values for live preview (from GPT or vision)."""
    data = load_form(form_id)
    if not data:
        return False
    data["sample_values"] = sample_values
    save_form(form_id, data)
    return True


# ── Original files (for AcroForm fill-back) ────────────────────────────

def save_original(form_id: str, file_bytes: bytes, suffix: str) -> str:
    path = ORIGINALS_DIR / f"{form_id}{suffix}"
    with _lock:
        with open(path, "wb") as f:
            f.write(file_bytes)
    return str(path)


def original_path(form_id: str) -> Optional[Path]:
    for suffix in (".pdf", ".png", ".jpg", ".jpeg"):
        p = ORIGINALS_DIR / f"{form_id}{suffix}"
        if p.exists():
            return p
    return None


# ── Sessions ───────────────────────────────────────────────────────────

def save_session(session_id: str, data: dict) -> None:
    _write(SESSIONS_DIR / f"{session_id}.json", data)


def load_session(session_id: str) -> Optional[dict]:
    return _read(SESSIONS_DIR / f"{session_id}.json")


def list_sessions_for_form(form_id: str) -> list[dict]:
    sessions = []
    for p in SESSIONS_DIR.glob("*.json"):
        data = _read(p)
        if data and data.get("form_id") == form_id:
            sessions.append(data)
    return sorted(sessions, key=lambda x: x.get("created_at", ""), reverse=True)


# ── Filled PDFs ────────────────────────────────────────────────────────

def filled_path(session_id: str) -> Path:
    return FILLED_DIR / f"{session_id}.pdf"
