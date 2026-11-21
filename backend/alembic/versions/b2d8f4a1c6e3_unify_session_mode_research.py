"""unify session mode: convert all 'ask' sessions to 'research'

Revision ID: b2d8f4a1c6e3
Revises: a7c3e91d4b20
Create Date: 2026-10-24 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2d8f4a1c6e3"
down_revision: str | None = "a7c3e91d4b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE research_sessions SET mode = 'research' WHERE mode = 'ask'")


def downgrade() -> None:
    # The original ask/research split isn't recoverable; sessions stay 'research'.
    pass
