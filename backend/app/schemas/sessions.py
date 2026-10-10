"""Session schemas."""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
import uuid

from app.db.models.research_session import SessionStatus, SessionMode, SourcePolicy
from app.schemas.sources import SourceRead

class SessionCreate(BaseModel):
    title: Optional[str] = "New Session"
    mode: Optional[SessionMode] = SessionMode.ask
    source_policy: Optional[SourcePolicy] = SourcePolicy.source_first
    source_ids: Optional[List[uuid.UUID]] = None

    @field_validator("mode", mode="before")
    @classmethod
    def normalize_mode(cls, v):
        if v is None:
            return SessionMode.ask
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in ("deep_research", "research"):
                return SessionMode.research
            elif v_clean in ("ask", "chat"):
                return SessionMode.ask
        return v

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[SessionStatus] = None
    source_policy: Optional[SourcePolicy] = None

class SessionRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    status: SessionStatus
    mode: SessionMode
    source_policy: SourcePolicy
    session_summary: Optional[str] = None
    last_activity_at: datetime
    created_at: datetime
    updated_at: datetime
    
    # Optional fields to be loaded
    sources: Optional[List[SourceRead]] = None

    model_config = ConfigDict(from_attributes=True)
