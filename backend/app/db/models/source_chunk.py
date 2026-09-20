"""SourceChunk model."""
from typing import Optional
from sqlalchemy import String, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
import uuid

from app.db.base import Base, TimestampMixin, UUIDMixin

class SourceChunk(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "source_chunks"

    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default={})
    embedding = mapped_column(Vector(768)) # Assuming 768 dimensions for now, can be configured

    # Relationships
    source = relationship("Source", back_populates="chunks")
    evidence = relationship("Evidence", back_populates="source_chunk")

    def __repr__(self) -> str:
        return f"<SourceChunk {self.id} (Source {self.source_id})>"
