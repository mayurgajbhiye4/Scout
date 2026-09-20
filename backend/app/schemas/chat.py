"""Chat schemas."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

from app.db.models.chat_message import MessageRole, MessageStatus

class ChatMessageCreate(BaseModel):
    content: str
    force_web_search: bool = False

class CitationRead(BaseModel):
    id: uuid.UUID
    citation_index: int
    source_id: uuid.UUID
    locator: dict

    model_config = ConfigDict(from_attributes=True)

class ChatMessageRead(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: MessageRole
    content: str
    status: MessageStatus
    created_at: datetime
    citations: List[CitationRead] = []

    model_config = ConfigDict(from_attributes=True)
