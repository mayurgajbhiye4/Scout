"""Workspace schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class WorkspaceResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    source_count: int = 0
    research_count: int = 0

    model_config = {"from_attributes": True}


class WorkspaceListResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime | None = None
    source_count: int = 0
    research_count: int = 0

    model_config = {"from_attributes": True}
