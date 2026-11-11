"""
Unit tests for the source ingestion state machine.
Tests:
- Only the documented status changes are allowed, and failure reasons are recorded and cleared
- A URL already being ingested joins that run instead of starting a second one
- Losing a race to add a brand-new URL falls back to the row that won
- An expired in-flight source can be ingested again, and is failed when the library is listed
- An unexpected error ends in `failed` on every ingestion path
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.core.rate_limit import limiter_backend
from app.db.models.source import Source, SourceStatus, SourceType
from app.schemas.sources import SourceCreate
from app.services import embedding_service, source_service
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


def _gemini_returning(vectors):
    response = MagicMock(embeddings=[MagicMock(values=v) for v in vectors])
    client = MagicMock()
    client.models.embed_content.return_value = response
    return MagicMock(return_value=client)


@pytest.mark.parametrize(
    ("api_key", "client"),
    [
        ("", None),  # not configured
        ("key", MagicMock(side_effect=RuntimeError("503 UNAVAILABLE"))),  # Gemini down
        ("key", _gemini_returning([])),  # Gemini answered with nothing usable
    ],
    ids=["no-key", "outage", "empty-response"],
)
async def test_embedding_outage_fails_the_source_without_saving_vectors(monkeypatch, api_key, client):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", api_key)
    if client is not None:
        monkeypatch.setattr("google.genai.Client", client)
    source = _source()
    source.content_text = "Enough text to chunk and embed."
    db = _db()

    result = await source_service.run_ingestion(db, source)

    assert result.status == SourceStatus.failed
    assert result.metadata_["error"] == source_service.EMBEDDING_UNAVAILABLE_ERROR
    db.add.assert_not_called()


async def test_embedding_rate_limit_fails_the_source_with_a_retry_hint(monkeypatch):
    limit = MagicMock(side_effect=RateLimitError(message="slow down", retry_after=42))
    monkeypatch.setattr(embedding_service, "enforce_pipeline_rate_limit", limit)
    source = _source()
    source.content_text = "Enough text to chunk and embed."
    db = _db()

    result = await source_service.run_ingestion(db, source)

    assert result.status == SourceStatus.failed
    assert "42 seconds" in result.metadata_["error"]
    db.add.assert_not_called()


async def test_embeddings_never_fall_back_to_stand_in_vectors(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "key")
    monkeypatch.setattr("google.genai.Client", MagicMock(side_effect=RuntimeError("503 UNAVAILABLE")))
    with pytest.raises(embedding_service.EmbeddingUnavailable):
        await embedding_service.generate_embeddings(["a query"])

    # One vector short, or the wrong size, is as unusable as none
    monkeypatch.setattr("google.genai.Client", _gemini_returning([[0.1] * settings.EMBEDDING_DIMENSIONS]))
    with pytest.raises(embedding_service.EmbeddingUnavailable):
        await embedding_service.generate_embeddings(["a", "b"])
    monkeypatch.setattr("google.genai.Client", _gemini_returning([[0.1, 0.2]]))
    with pytest.raises(embedding_service.EmbeddingUnavailable):
        await embedding_service.generate_embeddings(["a"])


async def test_working_embeddings_index_the_source(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "key")
    dims = settings.EMBEDDING_DIMENSIONS
    client = MagicMock()
    client.models.embed_content.side_effect = lambda model, contents, config: MagicMock(
        embeddings=[MagicMock(values=[0.1] * dims) for _ in contents]
    )
    monkeypatch.setattr("google.genai.Client", MagicMock(return_value=client))
    source = _source()
    source.content_text = "Enough text to chunk and embed."
    db = _db()

    result = await source_service.run_ingestion(db, source)

    assert result.status == SourceStatus.indexed
    assert db.add.call_count == result.metadata_["chunk_count"]


async def test_a_url_being_ingested_joins_that_run(monkeypatch):
    ingest = AsyncMock()
    monkeypatch.setattr(source_service, "ingest_source", ingest)
    existing = _source(status=SourceStatus.processing)

    result = await source_service.create_source(
        _db(existing), SourceCreate(url=existing.canonical_uri), existing.user_id
    )

    assert result is existing
    ingest.assert_not_awaited()


async def test_losing_a_race_to_add_a_new_url_joins_the_winner(monkeypatch):
    ingest = AsyncMock()
    monkeypatch.setattr(source_service, "ingest_source", ingest)
    winner = _source(status=SourceStatus.processing)
    # Nothing found on the first lookup, then the other request's row after the insert conflicts
    db = _db(None, winner)
    db.commit.side_effect = IntegrityError("INSERT", {}, Exception("uq_sources_user_canonical_uri"))

    result = await source_service.create_source(
        db, SourceCreate(url=f"  {winner.canonical_uri} "), winner.user_id
    )

    assert result is winner
    db.rollback.assert_awaited_once()
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
