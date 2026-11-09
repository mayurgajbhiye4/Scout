"""
The state machine for a source's ingestion. Every write to `Source.status` goes through here.

    pending ──> processing ──> indexed ──> stale
       │           │  ^           │          │
       │           v  │           │          │
       └───────> failed <─────────┼──────────┘ (re-ingesting goes back through processing)
                                  v
                              processing

Ingestion runs inside the request, so a server crash leaves a source in flight with nothing
working on it. An in-flight status is therefore only trusted for INGEST_LEASE after its last write.
"""

from datetime import UTC, datetime, timedelta

from app.db.models.source import Source, SourceStatus

INGEST_LEASE = timedelta(minutes=15)
ABANDONED_INGEST_ERROR = (
    "Ingestion was interrupted before it finished. Add the source again to retry."
)

IN_FLIGHT = frozenset({SourceStatus.pending, SourceStatus.processing})

TRANSITIONS: dict[SourceStatus, frozenset[SourceStatus]] = {
    SourceStatus.pending: frozenset({SourceStatus.processing, SourceStatus.failed}),
    # processing -> processing is a retry taking over an ingest whose lease expired
    SourceStatus.processing: frozenset(
        {SourceStatus.processing, SourceStatus.indexed, SourceStatus.failed}
    ),
    SourceStatus.indexed: frozenset({SourceStatus.processing, SourceStatus.stale}),
    SourceStatus.failed: frozenset({SourceStatus.processing}),
    SourceStatus.stale: frozenset({SourceStatus.processing}),
}


class InvalidSourceTransition(ValueError):
    """A code path tried a status change the lifecycle doesn't allow."""


def transition_source(source: Source, to: SourceStatus, error: str | None = None) -> None:
    """Moves a source to `to`, recording the reason on failure and clearing old ones otherwise."""
    if to not in TRANSITIONS[source.status]:
        raise InvalidSourceTransition(f"Source cannot go from {source.status.value} to {to.value}")
    source.status = to
    metadata = {k: v for k, v in (source.metadata_ or {}).items() if k != "error"}
    if to == SourceStatus.failed:
        metadata["error"] = error or "Ingestion failed"
    source.metadata_ = metadata


def lease_cutoff(now: datetime | None = None) -> datetime:
    """In-flight sources last written before this have been abandoned."""
    return (now or datetime.now(UTC)) - INGEST_LEASE


def is_ingest_running(source: Source, now: datetime | None = None) -> bool:
    return source.status in IN_FLIGHT and source.updated_at >= lease_cutoff(now)
