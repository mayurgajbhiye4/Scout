"""ResearchSession model — represents one research investigation."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class ResearchSession(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "research_sessions"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="queued"
    )  # queued, planning, researching, analyzing, drafting, reviewing, finalizing, completed, failed
    research_depth: Mapped[str] = mapped_column(String(20), nullable=False, default="standard")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    workspace = relationship("Workspace", back_populates="research_sessions")
    tasks = relationship(
        "ResearchTask", back_populates="research_session", cascade="all, delete-orphan"
    )
    evidence_items = relationship(
        "Evidence", back_populates="research_session", cascade="all, delete-orphan"
    )
    reports = relationship(
        "Report", back_populates="research_session", cascade="all, delete-orphan"
    )
    agent_runs = relationship(
        "AgentRun", back_populates="research_session", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ResearchSession {self.status}: {self.question[:50]}>"
