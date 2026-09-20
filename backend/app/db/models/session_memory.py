"""SessionMemory model."""
from typing import Optional
from sqlalchemy import String, ForeignKey, Integer, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
import uuid
import enum

from app.db.base import Base, TimestampMixin, UUIDMixin

class MemoryType(str, enum.Enum):
    summary = "summary"
    preference = "preference"
    research_context = "research_context"
    open_question = "open_question"

class SessionMemory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "session_memories"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    type: Mapped[MemoryType] = mapped_column(SQLEnum(MemoryType), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    source_message_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    
    embedding = mapped_column(Vector(768))

    # Relationships
    session = relationship("ResearchSession", back_populates="memories")

    def __repr__(self) -> str:
        return f"<SessionMemory {self.id}>"
