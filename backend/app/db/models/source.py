"""Source model."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class SourceType(str, enum.Enum):
    pdf = "pdf"
    website = "website"
    youtube = "youtube"
    github = "github"
    notion = "notion"
    txt = "txt"
    markdown = "markdown"
    docx = "docx"
    web_search_result = "web_search_result"


class SourceStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    indexed = "indexed"
    failed = "failed"
    stale = "stale"


class Source(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sources"
    # Postgres treats NULLs as distinct, so pasted-text sources without a URL are unaffected
    __table_args__ = (
        UniqueConstraint("user_id", "canonical_uri", name="uq_sources_user_canonical_uri"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_type: Mapped[SourceType] = mapped_column(SQLEnum(SourceType), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)

    canonical_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    status: Mapped[SourceStatus] = mapped_column(
        SQLEnum(SourceStatus), nullable=False, default=SourceStatus.pending
    )
    content_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    metadata_: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default={})
    content_text: Mapped[str | None] = mapped_column(String, nullable=True)

    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="sources")
    session_sources = relationship(
        "SessionSource", back_populates="source", cascade="all, delete-orphan"
    )
    chunks = relationship("SourceChunk", back_populates="source", cascade="all, delete-orphan")
    message_citations = relationship(
        "MessageCitation", back_populates="source", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Source {self.id} {self.source_type}>"
