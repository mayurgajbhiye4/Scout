"""ResearchEvent model."""
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from app.db.base import Base, UUIDMixin

class ResearchEvent(Base, UUIDMixin):
    __tablename__ = "research_events"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("ResearchSession", back_populates="events")

    def __repr__(self) -> str:
        return f"<ResearchEvent {self.id} ({self.event_type})>"
