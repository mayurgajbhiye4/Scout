"""Paged lists: the library, the session history and a session's sources come a page at a time."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine, insert, select
from sqlalchemy.dialects import postgresql

from app.api.deps import get_current_user, get_db
from app.db.models.source import Source, SourceStatus, SourceType
from app.main import app
from app.services import session_service, source_service

USER = SimpleNamespace(id=uuid.uuid4(), email="ada@example.com", name="Ada", is_active=True)
AUTH = {"Authorization": "Bearer t"}


@pytest.fixture
def signed_in():
    async def fake_db():
        yield MagicMock()

    app.dependency_overrides[get_current_user] = lambda: USER
    app.dependency_overrides[get_db] = fake_db
    yield
    app.dependency_overrides.clear()


class CapturingDB:
    """Records each statement as Postgres SQL and answers with canned rows."""

    def __init__(self, scalar=None, rows=None):
        self.sql: list[str] = []
        self._scalar = scalar
        self._rows = rows or []

    async def execute(self, stmt):
        self.sql.append(
            str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        )
        result = MagicMock()
        result.scalars.return_value.all.return_value = self._rows
        result.scalar_one_or_none.return_value = self._scalar
        result.all.return_value = self._rows
        return result

    async def commit(self):
        pass


# ── Routing and bounds ──────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    ["/api/v1/sources/?limit=101", "/api/v1/sources/?skip=-1", "/api/v1/sessions/?limit=0"],
)
async def test_page_size_is_bounded(async_client: AsyncClient, signed_in, path):
    res = await async_client.get(path, headers=AUTH)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_unknown_kind_is_rejected(async_client: AsyncClient, signed_in):
    res = await async_client.get("/api/v1/sources/?kind=spreadsheet", headers=AUTH)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_library_filters_reach_the_service(async_client: AsyncClient, signed_in, monkeypatch):
    seen = {}

    async def fake(db, user_id, **kwargs):
        seen.update(kwargs, user_id=user_id)
        return []

    monkeypatch.setattr("app.api.v1.sources.get_user_sources", fake)
    a, b = uuid.uuid4(), uuid.uuid4()
    res = await async_client.get(
        f"/api/v1/sources/?skip=40&limit=20&q=graph&kind=pdf&ids={a}&ids={b}", headers=AUTH
    )
    assert res.status_code == 200
    assert seen == {
        "user_id": USER.id,
        "skip": 40,
        "limit": 20,
        "query": "graph",
        "kind": "pdf",
        "ids": [a, b],
    }


@pytest.mark.asyncio
async def test_counts_route_is_not_taken_for_a_source_id(
    async_client: AsyncClient, signed_in, monkeypatch
):
    async def fake(db, user_id):
        return {"total": 3, "by_kind": {"pdf": 1, "youtube": 0, "github": 2, "web": 0, "notes": 0}}

    monkeypatch.setattr("app.api.v1.sources.count_user_sources_by_kind", fake)
    res = await async_client.get("/api/v1/sources/counts", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["total"] == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("suffix", ["sources", "source-ids"])
async def test_someone_elses_session_sources_are_not_found(
    async_client: AsyncClient, signed_in, monkeypatch, suffix
):
    async def none(*args, **kwargs):
        return None

    monkeypatch.setattr("app.api.v1.sessions.get_session_sources", none)
    monkeypatch.setattr("app.api.v1.sessions.get_session_source_ids", none)
    res = await async_client.get(f"/api/v1/sessions/{uuid.uuid4()}/{suffix}", headers=AUTH)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_session_sources_page_params_reach_the_service(
    async_client: AsyncClient, signed_in, monkeypatch
):
    seen = {}

    async def fake(db, session_id, user_id, skip, limit):
        seen.update(skip=skip, limit=limit, user_id=user_id)
        return []

    monkeypatch.setattr("app.api.v1.sessions.get_session_sources", fake)
    res = await async_client.get(
        f"/api/v1/sessions/{uuid.uuid4()}/sources?skip=20&limit=10", headers=AUTH
    )
    assert res.status_code == 200
    assert seen == {"skip": 20, "limit": 10, "user_id": USER.id}


# ── Queries ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_library_page_is_scoped_filtered_and_stably_ordered():
    db = CapturingDB()
    await source_service.get_user_sources(
        db, USER.id, skip=20, limit=20, query="50%_off", kind="github"
    )
    sql = db.sql[-1]
    assert "sources.user_id =" in sql  # owner only
    # The search's wildcards are escaped, so a literal % or _ in it doesn't match everything
    assert "50/%%/_off" in sql and "ESCAPE '/'" in sql
    assert "'github'" in sql
    assert "sources.id DESC" in sql
    assert "LIMIT 20 OFFSET 20" in sql


@pytest.mark.asyncio
async def test_session_sources_check_ownership_then_page():
    db = CapturingDB(scalar=uuid.uuid4())
    await session_service.get_session_sources(db, uuid.uuid4(), USER.id, skip=10, limit=5)
    assert "research_sessions.user_id" in db.sql[0]
    assert "JOIN session_sources" in db.sql[1]
    assert "session_sources.added_at DESC" in db.sql[1]
    assert "LIMIT 5 OFFSET 10" in db.sql[1]


@pytest.mark.asyncio
async def test_session_sources_of_someone_else_are_none():
    db = CapturingDB(scalar=None)
    assert await session_service.get_session_sources(db, uuid.uuid4(), USER.id) is None
    assert await session_service.get_session_source_ids(db, uuid.uuid4(), USER.id) is None
    assert len(db.sql) == 2  # only the ownership checks ran


@pytest.mark.asyncio
async def test_counts_fill_in_kinds_with_no_sources():
    db = CapturingDB(rows=[("pdf", 2), ("web", 5)])
    counts = await source_service.count_user_sources_by_kind(db, USER.id)
    assert counts == {
        "total": 7,
        "by_kind": {"pdf": 2, "youtube": 0, "github": 0, "web": 5, "notes": 0},
    }


# The server's kind must agree with the client's getSourceKind (frontend/src/features/workspace/sourceMeta.ts)
KIND_CASES = [
    (SourceType.website, "https://www.youtube.com/watch?v=x", "Talk", "youtube"),
    (SourceType.website, "https://youtu.be/x", "Talk 2", "youtube"),
    (SourceType.youtube, None, "Talk 3", "youtube"),
    (SourceType.website, "https://GitHub.com/a/b", "Repo", "github"),
    (SourceType.website, "https://example.com/paper.PDF", "Paper", "pdf"),
    (SourceType.txt, None, "notes.pdf", "pdf"),
    (SourceType.pdf, None, "Upload", "pdf"),
    (SourceType.markdown, None, "Readme", "notes"),
    (SourceType.docx, None, "Brief", "notes"),
    (SourceType.notion, None, "Page", "notes"),
    (SourceType.website, "https://example.com", "Home", "web"),
    (SourceType.web_search_result, "https://example.com/a", "Result", "web"),
]


def test_kind_matches_the_client():
    engine = create_engine("sqlite://")
    Source.__table__.create(engine)
    with engine.begin() as conn:
        for i, (stype, uri, title, _) in enumerate(KIND_CASES):
            conn.execute(
                insert(Source.__table__).values(
                    id=uuid.UUID(int=i + 1),
                    user_id=USER.id,
                    source_type=stype,
                    title=title,
                    canonical_uri=uri,
                    status=SourceStatus.indexed,
                    metadata={},
                )
            )
        kinds = (
            conn.execute(select(source_service.source_kind_expr()).order_by(Source.title))
            .scalars()
            .all()
        )
    expected = [case[3] for case in sorted(KIND_CASES, key=lambda c: c[2])]
    assert kinds == expected


@pytest.mark.asyncio
async def test_session_list_counts_sources_without_loading_them():
    session = SimpleNamespace(id=uuid.uuid4())
    db = CapturingDB(rows=[(session, 7)])
    [listed] = await session_service.get_user_sessions(db, USER.id, skip=0, limit=20)
    assert listed.source_count == 7
    sql = db.sql[-1]
    assert "count(*)" in sql and "session_sources.session_id = research_sessions.id" in sql
    # One query, and no source columns in it
    assert len(db.sql) == 1
    assert "sources.title" not in sql
