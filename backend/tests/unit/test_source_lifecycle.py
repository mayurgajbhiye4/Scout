"""
Unit tests for the source ingestion state machine.
Tests:
- Only the documented status changes are allowed, and failure reasons are recorded and cleared
- A URL already being ingested joins that run instead of starting a second one
- An expired in-flight source can be ingested again, and is failed when the library is listed
- An unexpected error ends in `failed` on every ingestion path
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.models.source import Source, SourceStatus, SourceType
from app.schemas.sources import SourceCreate
from app.services import source_service
from app.services.source_lifecycle import (
    ABANDONED_INGEST_ERROR,
    INGEST_LEASE,
    InvalidSourceTransition,
    is_ingest_running,
    transition_source,
)

NOW = datetime.now(UTC)
EXPIRED = NOW - INGEST_LEASE - timedelta(minutes=1)


def _source(status=SourceStatus.pending, updated_at=NOW, metadata=None):
    return Source(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_type=SourceType.website,
        title="A page",
        canonical_uri="https://example.com/page",
        status=status,
        updated_at=updated_at,
        metadata_=metadata or {},
    )


def _db(*found):
    db = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.side_effect = list(found)
    result.scalars.return_value.all.return_value = list(found)
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    return db


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (SourceStatus.pending, SourceStatus.indexed),
        (SourceStatus.failed, SourceStatus.indexed),
        (SourceStatus.indexed, SourceStatus.failed),
        (SourceStatus.stale, SourceStatus.failed),
    ],
)
def test_rejects_changes_outside_the_lifecycle(start, end):
    source = _source(status=start)
    with pytest.raises(InvalidSourceTransition):
        transition_source(source, end)
    assert source.status == start


def test_failure_reason_is_recorded_then_cleared_by_a_retry():
    source = _source(status=SourceStatus.processing, metadata={"chunk_count": 2})
    transition_source(source, SourceStatus.failed, error="No transcript")
    assert source.metadata_ == {"chunk_count": 2, "error": "No transcript"}

    transition_source(source, SourceStatus.processing)
    assert source.metadata_ == {"chunk_count": 2}


def test_an_in_flight_status_is_only_trusted_during_the_lease():
    assert is_ingest_running(_source(status=SourceStatus.processing), now=NOW)
    assert not is_ingest_running(
        _source(status=SourceStatus.processing, updated_at=EXPIRED), now=NOW
    )
    assert not is_ingest_running(_source(status=SourceStatus.failed), now=NOW)


async def test_a_url_being_ingested_joins_that_run(monkeypatch):
    ingest = AsyncMock()
    monkeypatch.setattr(source_service, "ingest_source", ingest)
    existing = _source(status=SourceStatus.processing)

    result = await source_service.create_source(
        _db(existing), SourceCreate(url=existing.canonical_uri), existing.user_id
    )

    assert result is existing
    ingest.assert_not_awaited()


async def test_an_abandoned_ingest_can_be_taken_over(monkeypatch):
    ingest = AsyncMock(side_effect=lambda db, source: source)
    monkeypatch.setattr(source_service, "ingest_source", ingest)
    existing = _source(status=SourceStatus.processing, updated_at=EXPIRED)

    await source_service.create_source(
        _db(existing), SourceCreate(url=existing.canonical_uri), existing.user_id
    )

    ingest.assert_awaited_once()


@pytest.mark.parametrize("status", [SourceStatus.pending, SourceStatus.processing])
async def test_listing_fails_abandoned_ingests(status):
    stuck = _source(status=status, updated_at=EXPIRED)
    db = _db(stuck)

    await source_service.fail_abandoned_ingests(db, stuck.user_id)

    assert stuck.status == SourceStatus.failed
    assert stuck.metadata_["error"] == ABANDONED_INGEST_ERROR
    db.commit.assert_awaited_once()


async def test_retrying_an_existing_source_ends_failed_on_an_unexpected_error(monkeypatch):
    async def explode(db, source):
        transition_source(source, SourceStatus.processing)
        raise RuntimeError("database went away")

    monkeypatch.setattr(source_service, "ingest_source", explode)
    existing = _source(status=SourceStatus.failed)
    db = _db(existing)

    result = await source_service.create_source(
        db, SourceCreate(url=existing.canonical_uri), existing.user_id
    )

    assert result.status == SourceStatus.failed
    assert result.metadata_["error"]
    db.rollback.assert_awaited_once()
