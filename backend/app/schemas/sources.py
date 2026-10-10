"""Source schemas."""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from datetime import datetime
import uuid

from app.db.models.source import SourceType, SourceStatus

class SourceCreate(BaseModel):
    url: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    source_type: Optional[SourceType] = None

class SourceRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_type: SourceType
    title: str
    canonical_uri: Optional[str] = None
    external_id: Optional[str] = None
    mime_type: Optional[str] = None
    status: SourceStatus
    chunk_count: Optional[int] = 0
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime

    @field_validator("chunk_count", mode="before")
    @classmethod
    def populate_chunk_count(cls, v, info):
        if v is not None:
            return v
        data = info.data if hasattr(info, "data") else {}
        meta = data.get("metadata", {})
        return meta.get("chunk_count", 0) if isinstance(meta, dict) else 0

    @field_validator("metadata", mode="before")
    @classmethod
    def ensure_dict(cls, v):
        if v is None:
            return {}
        return v

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

