"""ResearchSession model."""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.db.base import Base, TimestampMixin, UUIDMixin

class SessionStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    archived = "archived"

class SessionMode(str, enum.Enum):
    ask = "ask"
    research = "research"

class SourcePolicy(str, enum.Enum):
    source_only = "source_only"
    source_first = "source_first"

class ResearchSession(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "research_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Session")
    status: Mapped[SessionStatus] = mapped_column(SQLEnum(SessionStatus), nullable=False, default=SessionStatus.draft)
    source_policy: Mapped[SourcePolicy] = mapped_column(SQLEnum(SourcePolicy), nullable=False, default=SourcePolicy.source_first)
    mode: Mapped[SessionMode] = mapped_column(SQLEnum(SessionMode), nullable=False, default=SessionMode.ask)
    
    session_summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    memory_summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    user = relationship("User", back_populates="research_sessions")
    session_sources = relationship("SessionSource", back_populates="session", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    evidence = relationship("Evidence", back_populates="session", cascade="all, delete-orphan")
    web_search_runs = relationship("WebSearchRun", back_populates="session", cascade="all, delete-orphan")
    memories = relationship("SessionMemory", back_populates="session", cascade="all, delete-orphan")
    events = relationship("ResearchEvent", back_populates="session", cascade="all, delete-orphan")
    agent_runs = relationship("AgentRun", back_populates="session", cascade="all, delete-orphan")
    summaries = relationship("ResearchSummary", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<ResearchSession {self.id}>"
