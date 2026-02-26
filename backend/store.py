"""
Vaarta Persistence Layer v2
Added: session file attachments (uploaded docs/images in chat)
"""

import json
import logging
import os
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR      = Path(os.environ.get("VAARTA_DATA_DIR", "data"))
FORMS_DIR     = DATA_DIR / "forms"
ORIGINALS_DIR = DATA_DIR / "originals"
SESSIONS_DIR  = DATA_DIR / "sessions"
FILLED_DIR    = DATA_DIR / "filled"
FILES_DIR     = DATA_DIR / "session_files"   # ← new: uploaded attachments

for d in (FORMS_DIR, ORIGINALS_DIR, SESSIONS_DIR, FILLED_DIR, FILES_DIR):
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
    data = load_form(form_id)
    if not data:
        return False
    data["fields"] = fields
    data["form_title"] = title
    save_form(form_id, data)
    return True


def update_form_sample_values(form_id: str, sample_values: dict) -> bool:
    data = load_form(form_id)
    if not data:
        return False
    data["sample_values"] = sample_values
    save_form(form_id, data)
    return True


def update_form_health_score(form_id: str, health: dict) -> bool:
    data = load_form(form_id)
    if not data:
        return False
    data["health_score"] = health
    save_form(form_id, data)
    return True


# ── Original files ─────────────────────────────────────────────────────

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


# ── Session file attachments ───────────────────────────────────────────

def save_session_file(session_id: str, field_name: str, file_bytes: bytes, suffix: str) -> str:
    """
    Save a file uploaded by a user during chat (e.g. Aadhaar image, signature).
    Returns the storage path.
    One file per field per session — overwrites if re-uploaded.
    """
    session_dir = FILES_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    path = session_dir / f"{field_name}{suffix}"
    with _lock:
        with open(path, "wb") as f:
            f.write(file_bytes)
    return str(path)


def get_session_file(field_name: str, session_id: str) -> Optional[bytes]:
    """Return raw bytes of a previously uploaded session file, or None."""
    session_dir = FILES_DIR / session_id
    if not session_dir.exists():
        return None
    for suffix in (".pdf", ".png", ".jpg", ".jpeg", ".webp"):
        p = session_dir / f"{field_name}{suffix}"
        if p.exists():
            try:
                return p.read_bytes()
            except Exception:
                return None
    return None


def list_session_files(session_id: str) -> list[dict]:
    """
    Return metadata about all files uploaded in a session.
    Used by the agent dashboard to show attachments.
    """
    session_dir = FILES_DIR / session_id
    if not session_dir.exists():
        return []
    files = []
    for p in session_dir.iterdir():
        if p.is_file():
            files.append({
                "field_name": p.stem,
                "filename":   p.name,
                "size_kb":    round(p.stat().st_size / 1024, 1),
                "path":       str(p),
            })
    return files