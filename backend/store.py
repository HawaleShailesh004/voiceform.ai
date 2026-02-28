"""
Vaarta Persistence Layer — Facade.
Delegates to FileStore or (future) PostgresStore based on config.
Existing code can keep: import store; store.load_form(...)
"""

from pathlib import Path
from typing import Optional

from config import get_settings
from repositories.file_store import FileStore

_settings = get_settings()
_store: Optional[FileStore] = None


def _get_store() -> FileStore:
    global _store
    if _store is None:
        _store = FileStore(_settings.VAARTA_DATA_DIR)
    return _store


def save_form(form_id: str, data: dict) -> None:
    _get_store().save_form(form_id, data)


def load_form(form_id: str) -> Optional[dict]:
    return _get_store().load_form(form_id)


def list_forms() -> list[dict]:
    return _get_store().list_forms()


def delete_form(form_id: str) -> bool:
    return _get_store().delete_form(form_id)


def update_form_fields(form_id: str, fields: list, title: str) -> bool:
    return _get_store().update_form_fields(form_id, fields, title)


def update_form_sample_values(form_id: str, sample_values: dict) -> bool:
    return _get_store().update_form_sample_values(form_id, sample_values)


def update_form_health_score(form_id: str, health: dict) -> bool:
    return _get_store().update_form_health_score(form_id, health)


def save_original(form_id: str, file_bytes: bytes, suffix: str) -> str:
    return _get_store().save_original(form_id, file_bytes, suffix)


def original_path(form_id: str) -> Optional[Path]:
    return _get_store().original_path(form_id)


def save_session(session_id: str, data: dict) -> None:
    _get_store().save_session(session_id, data)


def load_session(session_id: str) -> Optional[dict]:
    return _get_store().load_session(session_id)


def list_sessions_for_form(form_id: str) -> list[dict]:
    return _get_store().list_sessions_for_form(form_id)


def filled_path(session_id: str) -> Path:
    return _get_store().filled_path(session_id)


def save_session_file(
    session_id: str, field_name: str, file_bytes: bytes, suffix: str
) -> str:
    return _get_store().save_session_file(
        session_id, field_name, file_bytes, suffix
    )


def get_session_file(field_name: str, session_id: str) -> Optional[bytes]:
    return _get_store().get_session_file(field_name, session_id)


def list_session_files(session_id: str) -> list[dict]:
    return _get_store().list_session_files(session_id)
