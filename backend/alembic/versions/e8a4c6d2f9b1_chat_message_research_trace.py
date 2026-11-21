"""store the research trace (searches, retries, evidence verdict) on chat messages

Revision ID: e8a4c6d2f9b1
Revises: d7f3b2c8e1a4
Create Date: 2026-10-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8a4c6d2f9b1"
down_revision: str | None = "d7f3b2c8e1a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("research_trace", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "research_trace")
