"""Evidence model."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.db.base import Base, UUIDMixin, TimestampMixin

class SupportStatus(str, enum.Enum):
    supported = "supported"
    partially_supported = "partially_supported"
    unsupported = "unsupported"
    contradicted = "contradicted"

class ConfidenceLabel(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"

class Evidence(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "evidence"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True, nullable=False)
    source_chunk_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("source_chunks.id", ondelete="SET NULL"), nullable=True)
    
    claim: Mapped[str] = mapped_column(String, nullable=False)
    supporting_excerpt: Mapped[str] = mapped_column(String, nullable=False)
    
    support_status: Mapped[SupportStatus] = mapped_column(SQLEnum(SupportStatus), nullable=False)
    confidence_label: Mapped[ConfidenceLabel] = mapped_column(SQLEnum(ConfidenceLabel), nullable=False)
    
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default={})

    # Relationships
    session = relationship("ResearchSession", back_populates="evidence")
    source = relationship("Source", back_populates="evidence")
    source_chunk = relationship("SourceChunk", back_populates="evidence")
    message_citations = relationship("MessageCitation", back_populates="evidence")

    def __repr__(self) -> str:
        return f"<Evidence {self.id}>"
