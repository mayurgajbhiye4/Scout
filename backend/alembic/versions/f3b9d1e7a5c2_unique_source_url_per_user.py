"""unique (user_id, canonical_uri) on sources

Two simultaneous first-time adds of the same URL could both pass the
"already exists?" check and insert two rows. The constraint makes the second
insert fail so create_source() can fall back to the row that won.

Existing duplicates are merged first: per (user, URL) the indexed row is kept
(oldest wins a tie), and session links, citations, evidence and ingestion
history move onto it before the extra rows are deleted.

Revision ID: f3b9d1e7a5c2
Revises: e8a4c6d2f9b1
Create Date: 2026-11-11 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f3b9d1e7a5c2'
down_revision: Union[str, None] = 'e8a4c6d2f9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_source() looks URLs up stripped, so store them that way too
    op.execute(
        r"""
        UPDATE sources
        SET canonical_uri = NULLIF(regexp_replace(canonical_uri, '^\s+|\s+$', '', 'g'), '')
        WHERE canonical_uri IS NOT NULL
          AND canonical_uri <> regexp_replace(canonical_uri, '^\s+|\s+$', '', 'g')
        """
    )

    op.execute(
        """
        CREATE TEMP TABLE source_dupes AS
        SELECT id AS dupe_id, keep_id
        FROM (
            SELECT id,
                   first_value(id) OVER (
                       PARTITION BY user_id, canonical_uri
                       ORDER BY (status = 'indexed') DESC, created_at, id
                   ) AS keep_id
            FROM sources
            WHERE canonical_uri IS NOT NULL
        ) ranked
        WHERE id <> keep_id
        """
    )

    # session_sources is keyed on (session_id, source_id), so merge rather than update
    op.execute(
        """
        INSERT INTO session_sources (session_id, source_id, added_at, is_primary)
        SELECT ss.session_id, d.keep_id, min(ss.added_at), bool_or(ss.is_primary)
        FROM session_sources ss
        JOIN source_dupes d ON d.dupe_id = ss.source_id
        GROUP BY ss.session_id, d.keep_id
        ON CONFLICT (session_id, source_id) DO UPDATE
        SET is_primary = session_sources.is_primary OR EXCLUDED.is_primary
        """
    )
    for table in ("message_citations", "evidence", "ingestion_runs"):
        op.execute(
            f"""
            UPDATE {table} t
            SET source_id = d.keep_id
            FROM source_dupes d
            WHERE t.source_id = d.dupe_id
            """
        )

    # Chunks and leftover session links of the extra rows go with them (ON DELETE CASCADE)
    op.execute("DELETE FROM sources WHERE id IN (SELECT dupe_id FROM source_dupes)")
    op.execute("DROP TABLE source_dupes")

    op.create_unique_constraint(
        'uq_sources_user_canonical_uri',
        'sources',
        ['user_id', 'canonical_uri'],
    )


def downgrade() -> None:
    # Merged duplicates are not restored
    op.drop_constraint('uq_sources_user_canonical_uri', 'sources', type_='unique')
