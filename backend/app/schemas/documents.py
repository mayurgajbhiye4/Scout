"""Document and Source schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, HttpUrl


class DocumentCreate(BaseModel):
    source_type: str  # 'file', 'url', 'youtube', 'github'
    filename: str | None = None
    url: str | None = None
    mime_type: str | None = None
    content: str | None = None


class DocumentResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    filename: str
    mime_type: str
    source_type: str
    status: str
    metadata_: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class SourceResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    type: str
    title: str
    url: str | None
    external_id: str | None
    metadata_: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
