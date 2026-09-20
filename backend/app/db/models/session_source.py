"""SessionSource model."""
from datetime import datetime
from sqlalchemy import Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from app.db.base import Base

class SessionSource(Base):
    __tablename__ = "session_sources"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), primary_key=True)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    session = relationship("ResearchSession", back_populates="session_sources")
    source = relationship("Source", back_populates="session_sources")

    def __repr__(self) -> str:
        return f"<SessionSource session={self.session_id} source={self.source_id}>"
