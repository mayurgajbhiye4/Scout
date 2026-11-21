"""Session schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models.research_session import SessionStatus, SourcePolicy


class SessionCreate(BaseModel):
    # Every session is a research session; a legacy `mode` field from old clients is ignored.
    title: str | None = "New Session"
    source_policy: SourcePolicy | None = SourcePolicy.source_first
    source_ids: list[uuid.UUID] | None = None


class SessionUpdate(BaseModel):
    title: str | None = None
    status: SessionStatus | None = None
    source_policy: SourcePolicy | None = None
    session_summary: str | None = None


class SessionRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    status: SessionStatus
    source_policy: SourcePolicy
    session_summary: str | None = None
    last_activity_at: datetime
    created_at: datetime
    updated_at: datetime

    # The session's sources are paged from /sessions/{id}/sources; lists only need how many there are
    source_count: int = 0

    model_config = ConfigDict(from_attributes=True)
