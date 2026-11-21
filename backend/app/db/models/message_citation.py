"""MessageCitation model."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin


class MessageCitation(Base, UUIDMixin):
    __tablename__ = "message_citations"

    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    citation_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # Null for web results and knowledge graph evidence, which aren't library sources
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), index=True, nullable=True
    )

    locator: Mapped[dict] = mapped_column(JSON, nullable=False, default={})
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    # Relationships
    message = relationship("ChatMessage", back_populates="citations")
    source = relationship("Source", back_populates="message_citations")

    def __repr__(self) -> str:
        return f"<MessageCitation {self.id}>"
