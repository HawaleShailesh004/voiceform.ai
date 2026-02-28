from datetime import datetime
from fastapi import APIRouter

from config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
    }
