"""Retrieval and Context schemas."""

from pydantic import BaseModel


class ContextChunk(BaseModel):
    document_id: str
    source_type: str
    title: str
    content: str
    score: float
    metadata_: dict | None = None


class RetrievalResult(BaseModel):
    chunks: list[ContextChunk]
    packed_context: str
    total_tokens: int
