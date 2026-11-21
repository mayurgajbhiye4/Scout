"""
Upload endpoints: POST /sources/upload and POST /sessions/{id}/sources/upload.
Tests:
- A PDF upload is extracted, saved and ingested, and comes back as the created source
- Files over MAX_UPLOAD_SIZE_MB are refused with 413, unsupported types with 415
- Uploading into a session that doesn't exist is a 404 before the file is processed
"""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.main import app
from app.services import source_service
from tests.unit.test_extractors import _pdf_with_text

USER = SimpleNamespace(id=uuid.uuid4())


@pytest.fixture
def db():
    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    found = MagicMock()
    found.scalars.return_value.first.return_value = None
    db.execute = AsyncMock(return_value=found)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: USER
    yield db
    app.dependency_overrides.clear()


@pytest.fixture
def indexed(monkeypatch):
    """run_ingestion marks the source indexed without chunking or embedding."""

    async def run(db, source):
        source.id = source.id or uuid.uuid4()
        source.created_at = source.updated_at = datetime.now(UTC)
        source.status = source_service.SourceStatus.indexed
        source.metadata_ = {**source.metadata_, "chunk_count": 1}
        return source

    monkeypatch.setattr(source_service, "run_ingestion", run)


async def test_uploading_a_pdf_creates_and_ingests_a_source(async_client: AsyncClient, db, indexed):
    response = await async_client.post(
        "/api/v1/sources/upload",
        files={"file": ("attention.pdf", _pdf_with_text("Attention"), "application/pdf")},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["source_type"] == "pdf"
    assert body["title"] == "attention"
    assert body["status"] == "indexed"
    assert body["canonical_uri"] is None
    assert body["metadata"]["filename"] == "attention.pdf"


async def test_a_title_field_overrides_the_file_name(async_client: AsyncClient, db, indexed):
    response = await async_client.post(
        "/api/v1/sources/upload",
        files={"file": ("a.pdf", _pdf_with_text("Text"), "application/pdf")},
        data={"title": "My paper"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["title"] == "My paper"


async def test_an_oversize_upload_is_refused(async_client: AsyncClient, db, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)

    response = await async_client.post(
        "/api/v1/sources/upload",
        files={"file": ("big.txt", b"x" * (1024 * 1024 + 1), "text/plain")},
    )

    assert response.status_code == 413
    db.add.assert_not_called()


async def test_an_unsupported_file_type_is_refused(async_client: AsyncClient, db):
    response = await async_client.post(
        "/api/v1/sources/upload",
        files={"file": ("photo.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )

    assert response.status_code == 415
    db.add.assert_not_called()


async def test_uploading_into_a_missing_session_is_a_404(
    async_client: AsyncClient, db, monkeypatch
):
    monkeypatch.setattr("app.api.v1.sessions.get_session", AsyncMock(return_value=None))

    response = await async_client.post(
        f"/api/v1/sessions/{uuid.uuid4()}/sources/upload",
        files={"file": ("a.pdf", _pdf_with_text("Text"), "application/pdf")},
    )

    assert response.status_code == 404
    db.add.assert_not_called()


@pytest.mark.parametrize(
    "body",
    [
        {"title": "Notes", "content": "Some pasted text"},
        {"url": "https://example.com/post", "content": "Some pasted text"},
        {"url": ""},
    ],
)
async def test_sources_are_only_created_from_a_link(async_client: AsyncClient, db, body):
    response = await async_client.post("/api/v1/sources/", json=body)

    assert response.status_code == 422
    db.add.assert_not_called()
