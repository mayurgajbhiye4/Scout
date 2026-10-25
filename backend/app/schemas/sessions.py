"""Session schemas."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
import uuid

from app.db.models.research_session import SessionStatus, SourcePolicy
from app.schemas.sources import SourceRead

class SessionCreate(BaseModel):
    # Every session is a research session; a legacy `mode` field from old clients is ignored.
    title: Optional[str] = "New Session"
    source_policy: Optional[SourcePolicy] = SourcePolicy.source_first
    source_ids: Optional[List[uuid.UUID]] = None

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[SessionStatus] = None
    source_policy: Optional[SourcePolicy] = None
    session_summary: Optional[str] = None

class SessionRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    status: SessionStatus
    source_policy: SourcePolicy
    session_summary: Optional[str] = None
    last_activity_at: datetime
    created_at: datetime
    updated_at: datetime
    
    # Optional fields to be loaded
    sources: Optional[List[SourceRead]] = None

    model_config = ConfigDict(from_attributes=True)
