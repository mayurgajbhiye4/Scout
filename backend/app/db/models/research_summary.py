"""ResearchSummary model."""
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from app.db.base import Base, TimestampMixin, UUIDMixin

class ResearchSummary(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "research_summaries"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary_markdown: Mapped[str] = mapped_column(String, nullable=False)

    # Relationships
    session = relationship("ResearchSession", back_populates="summaries")

    def __repr__(self) -> str:
        return f"<ResearchSummary {self.id}>"
