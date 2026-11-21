"""store suggested follow-up questions on chat messages

Revision ID: d7f3b2c8e1a4
Revises: c4e1a9b7d2f5
Create Date: 2026-10-24 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7f3b2c8e1a4"
down_revision: str | None = "c4e1a9b7d2f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("suggested_questions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "suggested_questions")
