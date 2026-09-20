"""WebSearchRun model."""
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Integer, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.db.base import Base, UUIDMixin

class WebSearchStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"

class WebSearchRun(Base, UUIDMixin):
    __tablename__ = "web_search_runs"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True, nullable=False)
    
    query: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[WebSearchStatus] = mapped_column(SQLEnum(WebSearchStatus), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("ResearchSession", back_populates="web_search_runs")

    def __repr__(self) -> str:
        return f"<WebSearchRun {self.id}>"
