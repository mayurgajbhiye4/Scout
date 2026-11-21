"""Chat schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.db.models.chat_message import MessageRole, MessageStatus


class ChatMessageCreate(BaseModel):
    content: str
    force_web_search: bool = False


class CitationRead(BaseModel):
    id: uuid.UUID
    citation_index: int
    source_id: uuid.UUID | None = None
    locator: dict

    model_config = ConfigDict(from_attributes=True)


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: MessageRole
    content: str
    status: MessageStatus
    created_at: datetime
    citations: list[CitationRead] = []
    suggested_questions: list[str] | None = None
    research_trace: dict[str, Any] | None = None
    answer_extras: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)
