"""Source schemas."""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from datetime import datetime
import uuid

from app.db.models.source import SourceType, SourceStatus

class SourceCreate(BaseModel):
    url: Optional[str] = None

class SourceRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_type: SourceType
    title: str
    canonical_uri: Optional[str] = None
    external_id: Optional[str] = None
    mime_type: Optional[str] = None
    status: SourceStatus
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime

    @field_validator("metadata", mode="before")
    @classmethod
    def ensure_dict(cls, v):
        if v is None:
            return {}
        return v

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

