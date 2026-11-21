"""store evidence quotes, graph relations and research threads shown around chat answers

Revision ID: a4c8e2f6b9d3
Revises: f3b9d1e7a5c2
Create Date: 2026-11-12 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4c8e2f6b9d3"
down_revision: str | None = "f3b9d1e7a5c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("answer_extras", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "answer_extras")
