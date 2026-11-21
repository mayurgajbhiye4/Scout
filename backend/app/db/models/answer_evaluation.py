"""AnswerEvaluation model: RAGAS scores for one sampled assistant answer (online monitoring)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDMixin


class AnswerEvaluation(Base, UUIDMixin):
    __tablename__ = "answer_evaluations"

    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True, nullable=False
    )
    judge_model: Mapped[str] = mapped_column(String(100), nullable=False)
    # One column per metric so reports can aggregate in SQL; None when the metric errored or didn't apply
    faithfulness: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_relevancy: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_precision: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # {metric: "ErrorType: message"} for metrics the judge couldn't score
    errors: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<AnswerEvaluation {self.id} (message {self.message_id})>"
