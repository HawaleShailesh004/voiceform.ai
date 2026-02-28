"""
Vaarta Backend API — v3.0
Fully modular: all routes live in api/routes (health, agent, forms, sessions, chat, fill, whatsapp).
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from api.routes import (
    health_router,
    agent_router,
    forms_router,
    sessions_router,
    chat_router,
    fill_router,
    whatsapp_router,
    audio_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

_settings = get_settings()
app = FastAPI(
    title=_settings.APP_TITLE,
    version=_settings.APP_VERSION,
    docs_url="/docs",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(agent_router)
app.include_router(forms_router)
app.include_router(sessions_router)
app.include_router(chat_router)
app.include_router(fill_router)
app.include_router(whatsapp_router)
app.include_router(audio_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
