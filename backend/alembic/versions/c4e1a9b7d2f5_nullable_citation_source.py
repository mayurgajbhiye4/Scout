"""allow message citations without a library source (web results, knowledge graph evidence)

Revision ID: c4e1a9b7d2f5
Revises: b2d8f4a1c6e3
Create Date: 2026-10-24 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e1a9b7d2f5'
down_revision: Union[str, None] = 'b2d8f4a1c6e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('message_citations', 'source_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM message_citations WHERE source_id IS NULL")
    op.alter_column('message_citations', 'source_id', existing_type=sa.UUID(), nullable=False)
