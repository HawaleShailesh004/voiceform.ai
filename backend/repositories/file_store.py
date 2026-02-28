"""
File-based implementation of StoreProtocol.
Uses JSON files and binary files under a configurable data directory.
"""

import json
import logging
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class FileStore:
    """File-based persistence: forms, originals, sessions, filled PDFs, session files."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.forms_dir = self.data_dir / "forms"
        self.originals_dir = self.data_dir / "originals"
        self.sessions_dir = self.data_dir / "sessions"
        self.filled_dir = self.data_dir / "filled"
        self.files_dir = self.data_dir / "session_files"
        for d in (
            self.forms_dir,
            self.originals_dir,
            self.sessions_dir,
            self.filled_dir,
            self.files_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _read(self, path: Path) -> Optional[dict]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def _write(self, path: Path, data: dict) -> None:
        with self._lock:
            tmp = path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            tmp.replace(path)

    # Forms
    def save_form(self, form_id: str, data: dict) -> None:
        self._write(self.forms_dir / f"{form_id}.json", data)

    def load_form(self, form_id: str) -> Optional[dict]:
        return self._read(self.forms_dir / f"{form_id}.json")

    def list_forms(self) -> list[dict]:
        forms = []
        for p in sorted(
            self.forms_dir.glob("*.json"),
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        ):
            data = self._read(p)
            if data:
                forms.append(data)
        return forms

    def delete_form(self, form_id: str) -> bool:
        """Delete a form and all its data: form JSON, original file, sessions, filled PDFs, session files."""
        form_path = self.forms_dir / f"{form_id}.json"
        if not form_path.exists():
            return False
        with self._lock:
            # Delete all sessions for this form (and their filled PDFs + session_files)
            for p in list(self.sessions_dir.glob("*.json")):
                data = self._read(p)
                if data and data.get("form_id") == form_id:
                    sid = p.stem
                    self.filled_path(sid).unlink(missing_ok=True)
                    session_files_dir = self.files_dir / sid
                    if session_files_dir.exists():
                        for f in session_files_dir.iterdir():
                            if f.is_file():
                                f.unlink(missing_ok=True)
                        session_files_dir.rmdir()
                    p.unlink(missing_ok=True)
            # Delete original file(s)
            for suffix in (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff"):
                orig = self.originals_dir / f"{form_id}{suffix}"
                orig.unlink(missing_ok=True)
            form_path.unlink(missing_ok=True)
        return True

    def update_form_fields(self, form_id: str, fields: list, title: str) -> bool:
        data = self.load_form(form_id)
        if not data:
            return False
        data["fields"] = fields
        data["form_title"] = title
        self.save_form(form_id, data)
        return True

    def update_form_sample_values(self, form_id: str, sample_values: dict) -> bool:
        data = self.load_form(form_id)
        if not data:
            return False
        data["sample_values"] = sample_values
        self.save_form(form_id, data)
        return True

    def update_form_health_score(self, form_id: str, health: dict) -> bool:
        data = self.load_form(form_id)
        if not data:
            return False
        data["health_score"] = health
        self.save_form(form_id, data)
        return True

    # Originals
    def save_original(self, form_id: str, file_bytes: bytes, suffix: str) -> str:
        path = self.originals_dir / f"{form_id}{suffix}"
        with self._lock:
            with open(path, "wb") as f:
                f.write(file_bytes)
        return str(path)

    def original_path(self, form_id: str) -> Optional[Path]:
        for suffix in (".pdf", ".png", ".jpg", ".jpeg"):
            p = self.originals_dir / f"{form_id}{suffix}"
            if p.exists():
                return p
        return None

    # Sessions
    def save_session(self, session_id: str, data: dict) -> None:
        self._write(self.sessions_dir / f"{session_id}.json", data)

    def load_session(self, session_id: str) -> Optional[dict]:
        return self._read(self.sessions_dir / f"{session_id}.json")

    def list_sessions_for_form(self, form_id: str) -> list[dict]:
        sessions = []
        for p in self.sessions_dir.glob("*.json"):
            data = self._read(p)
            if data and data.get("form_id") == form_id:
                sessions.append(data)
        return sorted(
            sessions, key=lambda x: x.get("created_at", ""), reverse=True
        )

    # Filled PDFs
    def filled_path(self, session_id: str) -> Path:
        return self.filled_dir / f"{session_id}.pdf"

    # Session file attachments
    def save_session_file(
        self,
        session_id: str,
        field_name: str,
        file_bytes: bytes,
        suffix: str,
    ) -> str:
        session_dir = self.files_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        path = session_dir / f"{field_name}{suffix}"
        with self._lock:
            with open(path, "wb") as f:
                f.write(file_bytes)
        return str(path)

    def get_session_file(
        self, field_name: str, session_id: str
    ) -> Optional[bytes]:
        session_dir = self.files_dir / session_id
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

    def list_session_files(self, session_id: str) -> list[dict]:
        session_dir = self.files_dir / session_id
        if not session_dir.exists():
            return []
        files = []
        for p in session_dir.iterdir():
            if p.is_file():
                files.append({
                    "field_name": p.stem,
                    "filename": p.name,
                    "size_kb": round(p.stat().st_size / 1024, 1),
                    "path": str(p),
                })
        return files
