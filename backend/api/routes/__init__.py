"""API route modules."""

from .health import router as health_router
from .forms import router as forms_router
from .agent import router as agent_router
from .sessions import router as sessions_router
from .chat import router as chat_router
from .fill import router as fill_router
from .whatsapp import router as whatsapp_router
from .audio import router as audio_router

__all__ = [
    "health_router",
    "forms_router",
    "agent_router",
    "sessions_router",
    "chat_router",
    "fill_router",
    "whatsapp_router",
    "audio_router",
]
