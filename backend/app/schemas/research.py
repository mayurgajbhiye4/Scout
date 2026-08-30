"""Research schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ResearchCreate(BaseModel):
    question: str
    research_depth: str = "standard"


class ResearchSessionResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    question: str
    status: str
    research_depth: str
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvidenceResponse(BaseModel):
    id: UUID
    claim: str
    supporting_excerpt: str
    confidence: float
    source_id: UUID | None
    
    model_config = {"from_attributes": True}


class ReportResponse(BaseModel):
    id: UUID
    title: str
    summary: str | None
    content_markdown: str
    
    model_config = {"from_attributes": True}
