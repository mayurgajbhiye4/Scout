"""ResearchTask model — a decomposed sub-question within a research session."""

import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class ResearchTask(Base, UUIDMixin, TimestampMixin):
    """ResearchTask model - a decomposed sub-question within a research session."""
    __tablename__ = "research_tasks"

    research_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("research_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[str] = mapped_column(String(100), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    task_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # web, workspace, github, mixed
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, running, completed, failed
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    research_session = relationship("ResearchSession", back_populates="tasks")

    def __repr__(self) -> str:
        return f"<ResearchTask {self.task_id} ({self.status})>"
