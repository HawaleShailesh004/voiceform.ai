"""Request body models for Vaarta API."""

from typing import Optional

from pydantic import BaseModel


class SessionCreate(BaseModel):
    form_id: str


class ChatMessage(BaseModel):
    session_id: str
    message: str
    lang: str = "en"


class ChatOpen(BaseModel):
    session_id: str
    lang: str = "en"


class FormUpdate(BaseModel):
    fields: list
    form_title: str


class SampleValuesRequest(BaseModel):
    fields: Optional[list] = None


class WhatsAppDelivery(BaseModel):
    phone: str
    lang: str = "en"
