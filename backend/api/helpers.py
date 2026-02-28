"""Shared helpers for API routes (progress, session summary)."""


def progress(session: dict, form: dict) -> tuple[int, int]:
    """Return (filled_count, total_fields)."""
    total = len(form.get("fields", []))
    filled = len([
        v for v in session.get("collected", {}).values()
        if v not in (None, "", "N/A", "SKIPPED")
    ])
    filled = min(filled, total) if total else 0
    return filled, total


def session_summary(session: dict, form: dict) -> dict:
    """Build session summary dict for API responses."""
    filled, total = progress(session, form)
    return {
        "session_id": session["session_id"],
        "form_id": session["form_id"],
        "created_at": session["created_at"],
        "status": session["status"],
        "progress_pct": round(filled / total * 100) if total else 0,
        "filled_fields": filled,
        "total_fields": total,
        "collected": session.get("collected", {}),
        "lang": session.get("lang", "en"),
    }
