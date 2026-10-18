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

    @field_validator("source_type", mode="before")
    @classmethod
    def normalize_source_type(cls, v):
        if not v:
            return None
        if isinstance(v, SourceType):
            return v
        if isinstance(v, str):
            v_lower = v.strip().lower()
            mapping = {
                "web": SourceType.website,
                "website": SourceType.website,
                "url": SourceType.website,
                "link": SourceType.website,
                "docs": SourceType.website,
                "doc": SourceType.docx,
                "docx": SourceType.docx,
                "pdf": SourceType.pdf,
                "youtube": SourceType.youtube,
                "video": SourceType.youtube,
                "github": SourceType.github,
                "git": SourceType.github,
                "repo": SourceType.github,
                "notion": SourceType.notion,
                "txt": SourceType.txt,
                "text": SourceType.txt,
                "markdown": SourceType.markdown,
                "md": SourceType.markdown,
                "web_search_result": SourceType.web_search_result,
            }
            if v_lower in mapping:
                return mapping[v_lower]
        return v

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
    last_indexed_at: Optional[datetime] = None

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

