"""IngestionRun model."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.db.base import Base, UUIDMixin

class IngestionStatus(str, enum.Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"

class IngestionRun(Base, UUIDMixin):
    __tablename__ = "ingestion_runs"

    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[IngestionStatus] = mapped_column(SQLEnum(IngestionStatus), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default={})

    # Relationships
    source = relationship("Source", back_populates="ingestion_runs")

    def __repr__(self) -> str:
        return f"<IngestionRun {self.id} ({self.status})>"
