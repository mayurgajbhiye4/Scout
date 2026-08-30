"""ReportCitation model — deterministic citation mapping for reports."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class ReportCitation(Base, UUIDMixin):
    __tablename__ = "report_citations"

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="SET NULL"),
        nullable=True,
    )
    citation_key: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "1", "2", "3"
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    report = relationship("Report", back_populates="citations")
    source = relationship("Source", back_populates="report_citations")

    def __repr__(self) -> str:
        return f"<ReportCitation [{self.citation_key}]>"
