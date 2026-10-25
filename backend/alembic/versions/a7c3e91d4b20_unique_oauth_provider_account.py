"""unique (provider, provider_account_id) on oauth_accounts

Revision ID: a7c3e91d4b20
Revises: 51ffcb981981
Create Date: 2026-10-24 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a7c3e91d4b20'
down_revision: Union[str, None] = '51ffcb981981'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        'uq_oauth_accounts_provider_account',
        'oauth_accounts',
        ['provider', 'provider_account_id'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_oauth_accounts_provider_account', 'oauth_accounts', type_='unique')
