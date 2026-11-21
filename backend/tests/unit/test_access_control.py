"""Access control and Cypher-safety regressions: one user can't read or write another's data."""

import re
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user, get_db
from app.graph.engine import graph_engine
from app.main import app
from app.memory.store import UserMemoryStore
from app.services import chat_service

USER = SimpleNamespace(id=uuid.uuid4(), email="ada@example.com", name="Ada", is_active=True)


@pytest.fixture
def signed_in():
    async def fake_db():
        yield MagicMock()

    app.dependency_overrides[get_current_user] = lambda: USER
    app.dependency_overrides[get_db] = fake_db
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chat_on_someone_elses_session_is_not_found(
    async_client: AsyncClient, signed_in, monkeypatch
):
    async def no_session(db, session_id, user_id):
        return None

    streamed = MagicMock()
    monkeypatch.setattr("app.api.v1.chat.get_session", no_session)
    monkeypatch.setattr("app.api.v1.chat.stream_chat_response", streamed)

    res = await async_client.post(
        f"/api/v1/chat/sessions/{uuid.uuid4()}/chat",
        json={"content": "hello"},
        headers={"Authorization": "Bearer t"},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
    streamed.assert_not_called()


@pytest.mark.asyncio
async def test_session_messages_are_scoped_to_the_owner():
    captured = {}

    class FakeDB:
        async def execute(self, stmt):
            captured["sql"] = str(stmt)
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            return result

    await chat_service.get_session_messages(FakeDB(), session_id=uuid.uuid4(), user_id=USER.id)
    assert "research_sessions.user_id" in captured["sql"]


def test_document_graph_only_matches_the_users_own_document(monkeypatch):
    calls = []
    monkeypatch.setattr(graph_engine, "_execute_read", lambda q, p=None: calls.append((q, p)) or [])

    graph = graph_engine.get_graph_by_id("user-a", "doc-of-user-b")
    assert graph == {"nodes": [], "edges": []}
    query, params = calls[0]
    assert "EXTRACTED_FROM]->(:User {id: $user_id})" in query
    assert params["user_id"] == "user-a"


def test_memory_interaction_rejects_cypher_in_the_action(monkeypatch):
    writes = []
    monkeypatch.setattr(graph_engine, "_execute_write", lambda q, p=None: writes.append(q))
    store = UserMemoryStore("user-a")

    with pytest.raises(ValueError):
        store.record_interaction(
            action="LIKES]->(t)DETACH/**/DELETE/**/t//",
            target_node_id="x",
            target_label="Attention",
        )
    assert writes == []


def test_memory_interaction_sanitizes_the_target_label(monkeypatch):
    writes = []
    monkeypatch.setattr(graph_engine, "_execute_write", lambda q, p=None: writes.append(q))
    store = UserMemoryStore("user-a")

    store.record_interaction(
        action="likes",
        target_node_id="x",
        target_label="Attention",
        target_type="Paper {id: 1})MATCH (n) DETACH DELETE n//",
    )
    assert len(writes) == 1
    # The label reaches the query as letters and digits only, so nothing after it can be smuggled in
    assert re.search(r"MERGE \(t:[A-Za-z0-9]+ \{id: \$target_id\}\)", writes[0])
    assert "-[r:LIKES]->" in writes[0]


@pytest.mark.asyncio
async def test_memory_interact_endpoint_rejects_unknown_actions(
    async_client: AsyncClient, signed_in
):
    res = await async_client.post(
        "/api/v1/knowledge/memory/interact",
        json={"action": "LIKES]->(t) DETACH DELETE t //", "target_node_id": "x"},
        headers={"Authorization": "Bearer t"},
    )
    assert res.status_code == 422
