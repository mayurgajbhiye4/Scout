"""ChatMessage model."""
from datetime import datetime
from typing import Optional
from sqlalchemy import JSON, String, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.db.base import Base, UUIDMixin

class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"

class MessageStatus(str, enum.Enum):
    pending = "pending"
    streaming = "streaming"
    completed = "completed"
    failed = "failed"

class ChatMessage(Base, UUIDMixin):
    __tablename__ = "chat_messages"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[MessageRole] = mapped_column(SQLEnum(MessageRole), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[MessageStatus] = mapped_column(SQLEnum(MessageStatus), nullable=False, default=MessageStatus.completed)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    # Follow-up questions offered after an assistant answer
    suggested_questions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # How the answer's evidence was found: {"searches": [{"source", "query", "found"}], "retries": int,
    # "verdict": {"sufficient", "reason"} | null}
    research_trace: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    session = relationship("ResearchSession", back_populates="chat_messages")
    citations = relationship("MessageCitation", back_populates="message", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<ChatMessage {self.id} ({self.role})>"
