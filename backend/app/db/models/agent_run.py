"""AgentRun model."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from app.db.base import Base, UUIDMixin, TimestampMixin

class AgentRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agent_runs"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    message_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    
    node_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    token_usage: Mapped[dict] = mapped_column(JSON, nullable=False, default={})
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default={})
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationships
    session = relationship("ResearchSession", back_populates="agent_runs")

    def __repr__(self) -> str:
        return f"<AgentRun {self.id} ({self.node_name})>"
