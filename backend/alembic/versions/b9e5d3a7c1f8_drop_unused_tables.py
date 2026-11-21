"""drop tables that no code path ever writes

evidence, agent_runs, ingestion_runs, research_events, research_summaries and
web_search_runs were created by the 3.0 init migration but never populated:
nothing in the app inserts into them. Answer evidence lives in
chat_messages.answer_extras and the research trace in
chat_messages.research_trace instead. message_citations.evidence_id (always
NULL) goes with the evidence table.

Databases that predate the 3.0 init migration also still carry the old
workspaces/documents/reports schema, which no model or migration tracks.
Those are dropped with IF EXISTS (a fresh database never had them) and are
not recreated on downgrade.

Revision ID: b9e5d3a7c1f8
Revises: a4c8e2f6b9d3
Create Date: 2026-11-17 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b9e5d3a7c1f8"
down_revision: str | None = "a4c8e2f6b9d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DROPPED_ENUMS = ("supportstatus", "confidencelabel", "ingestionstatus", "websearchstatus")

# Pre-3.0 tables left behind in older databases; children before parents.
LEGACY_TABLES = (
    "report_citations",
    "reports",
    "research_tasks",
    "document_chunks",
    "documents",
    "workspaces",
)


def upgrade() -> None:
    # Dropping the column also drops its FK to evidence.
    op.drop_column("message_citations", "evidence_id")

    for table in (
        "evidence",
        "agent_runs",
        "ingestion_runs",
        "research_events",
        "research_summaries",
        "web_search_runs",
    ):
        op.drop_table(table)  # indexes are dropped with the table

    for enum_name in DROPPED_ENUMS:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")

    for table in LEGACY_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table}")


def downgrade() -> None:
    op.create_table(
        "ingestion_runs",
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("processing", "completed", "failed", name="ingestionstatus"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestion_runs_id"), "ingestion_runs", ["id"], unique=False)
    op.create_index(
        op.f("ix_ingestion_runs_source_id"), "ingestion_runs", ["source_id"], unique=False
    )

    op.create_table(
        "research_events",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["research_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_research_events_id"), "research_events", ["id"], unique=False)
    op.create_index(
        op.f("ix_research_events_session_id"), "research_events", ["session_id"], unique=False
    )

    op.create_table(
        "research_summaries",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("summary_markdown", sa.String(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["research_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_research_summaries_id"), "research_summaries", ["id"], unique=False)
    op.create_index(
        op.f("ix_research_summaries_session_id"), "research_summaries", ["session_id"], unique=False
    )

    op.create_table(
        "agent_runs",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("message_id", sa.UUID(), nullable=True),
        sa.Column("node_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("token_usage", sa.JSON(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["research_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_runs_id"), "agent_runs", ["id"], unique=False)
    op.create_index(op.f("ix_agent_runs_session_id"), "agent_runs", ["session_id"], unique=False)

    op.create_table(
        "evidence",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("source_chunk_id", sa.UUID(), nullable=True),
        sa.Column("claim", sa.String(), nullable=False),
        sa.Column("supporting_excerpt", sa.String(), nullable=False),
        sa.Column(
            "support_status",
            sa.Enum(
                "supported",
                "partially_supported",
                "unsupported",
                "contradicted",
                name="supportstatus",
            ),
            nullable=False,
        ),
        sa.Column(
            "confidence_label",
            sa.Enum("high", "medium", "low", name="confidencelabel"),
            nullable=False,
        ),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["research_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_chunk_id"], ["source_chunks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_evidence_id"), "evidence", ["id"], unique=False)
    op.create_index(op.f("ix_evidence_session_id"), "evidence", ["session_id"], unique=False)
    op.create_index(op.f("ix_evidence_source_id"), "evidence", ["source_id"], unique=False)

    op.create_table(
        "web_search_runs",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("message_id", sa.UUID(), nullable=False),
        sa.Column("query", sa.String(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "completed", "failed", name="websearchstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["research_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_web_search_runs_id"), "web_search_runs", ["id"], unique=False)
    op.create_index(
        op.f("ix_web_search_runs_message_id"), "web_search_runs", ["message_id"], unique=False
    )
    op.create_index(
        op.f("ix_web_search_runs_session_id"), "web_search_runs", ["session_id"], unique=False
    )

    op.add_column("message_citations", sa.Column("evidence_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "message_citations_evidence_id_fkey",
        "message_citations",
        "evidence",
        ["evidence_id"],
        ["id"],
        ondelete="SET NULL",
    )
