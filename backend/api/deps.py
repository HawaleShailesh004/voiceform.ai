"""FastAPI dependencies and require-helpers for routes."""

from typing import Annotated

from fastapi import Depends, HTTPException

import store


def get_store():
    """Return the persistence store (module facade). Use in Depends()."""
    return store


def require_form(
    form_id: str,
    store_instance: Annotated[object, Depends(get_store)] = None,
) -> dict:
    """Load form by id or raise 404. Use as Depends(require_form) with form_id in path."""
    s = store_instance or store
    form = s.load_form(form_id)
    if not form:
        raise HTTPException(404, f"Form '{form_id}' not found")
    return form


def require_session(
    session_id: str,
    store_instance: Annotated[object, Depends(get_store)] = None,
) -> dict:
    """Load session by id or raise 404."""
    s = store_instance or store
    session = s.load_session(session_id)
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found")
    return session
