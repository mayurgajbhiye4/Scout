"""Session schemas."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
import uuid

from app.db.models.research_session import SessionStatus, SessionMode, SourcePolicy
from app.schemas.sources import SourceRead

class SessionCreate(BaseModel):
    title: Optional[str] = "New Session"
    mode: Optional[SessionMode] = SessionMode.ask
    source_policy: Optional[SourcePolicy] = SourcePolicy.source_first

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
