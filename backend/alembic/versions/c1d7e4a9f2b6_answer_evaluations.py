"""answer_evaluations: RAGAS scores for sampled chat answers (online monitoring)

Revision ID: c1d7e4a9f2b6
Revises: b9e5d3a7c1f8
Create Date: 2026-11-19 12:00:00.000000

The app's startup create_all may already have made the table (a server running the new model before this
migration ran), so the table and its indexes are only created when missing.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d7e4a9f2b6"
down_revision: str | None = "b9e5d3a7c1f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


INDEXES = {
    "ix_answer_evaluations_id": ["id"],
    "ix_answer_evaluations_message_id": ["message_id"],
    "ix_answer_evaluations_session_id": ["session_id"],
    "ix_answer_evaluations_created_at": ["created_at"],
}


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("answer_evaluations"):
        for name, columns in INDEXES.items():
            op.create_index(name, "answer_evaluations", columns, if_not_exists=True)
        return
    op.create_table(
        "answer_evaluations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("research_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("judge_model", sa.String(100), nullable=False),
        sa.Column("faithfulness", sa.Float(), nullable=True),
        sa.Column("answer_relevancy", sa.Float(), nullable=True),
        sa.Column("context_precision", sa.Float(), nullable=True),
        sa.Column("context_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors", sa.JSON(), nullable=True),
    )
    for name, columns in INDEXES.items():
        op.create_index(name, "answer_evaluations", columns)


def downgrade() -> None:
    for name in INDEXES:
        op.drop_index(name, table_name="answer_evaluations", if_exists=True)
    op.drop_table("answer_evaluations", if_exists=True)
