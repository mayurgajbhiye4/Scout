"""Source schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models.source import SourceStatus, SourceType


class SourceCreate(BaseModel):
    """A source added by link. Files go through the upload endpoints; there is no raw-text source."""

    # Unknown fields (such as the removed `content`) are a 422 rather than silently ignored
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=1024)
    title: str | None = None
    source_type: SourceType | None = None

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
    canonical_uri: str | None = None
    external_id: str | None = None
    mime_type: str | None = None
    status: SourceStatus
    chunk_count: int | None = 0
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime
    last_indexed_at: datetime | None = None

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


class SourceCounts(BaseModel):
    """The library's size, in all and per kind (pdf, youtube, github, web, notes)."""

    total: int
    by_kind: dict[str, int]
