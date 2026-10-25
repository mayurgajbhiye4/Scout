"""
Unit tests for failed generations.
Tests:
- Provider errors are classified into clear user-facing messages (credits, quota, our rate limit, other)
- A failed generation streams an error event and saves NO assistant reply to the chat history
- Falling back to local hash embeddings always logs a warning about degraded search quality
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.db.models.chat_message import ChatMessage, MessageRole
from app.schemas.chat import ChatMessageCreate
from app.services import chat_service, embedding_service
from app.services.chat_service import describe_generation_error, stream_chat_response

GEMINI_402 = (
    "Error calling model 'gemini-3.5-flash' (RESOURCE_EXHAUSTED): 402 RESOURCE_EXHAUSTED. "
    "{'error': {'code': 402, 'message': 'Your prepayment credits are depleted.'}}"
)


def test_classifies_depleted_credits():
    assert describe_generation_error(Exception(GEMINI_402)) == {
        "error_code": "provider_credits",
        "error": "The AI provider's credits are exhausted — try again later.",
    }


def test_classifies_provider_quota_and_our_rate_limit():
    assert describe_generation_error(Exception("429 RESOURCE_EXHAUSTED: quota exceeded"))["error_code"] == "provider_quota"
    assert describe_generation_error(RateLimitError("pipeline:llm"))["error_code"] == "rate_limited"


def test_unknown_or_missing_errors_get_generic_message():
    assert describe_generation_error(Exception("boom"))["error_code"] == "generation_failed"
    assert describe_generation_error(None)["error_code"] == "generation_failed"


class FailingGraph:
    async def astream_events(self, *args, **kwargs):
        yield {"event": "on_chain_start", "name": "retrieve"}
        raise RuntimeError(GEMINI_402)


def _fake_db():
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


async def test_failed_generation_streams_error_and_saves_no_reply(monkeypatch):
    monkeypatch.setattr(chat_service, "build_graph", lambda: FailingGraph())
    db = _fake_db()

    events = [
        json.loads(chunk[len("data: "):])
        async for chunk in stream_chat_response(
            db, uuid.uuid4(), ChatMessageCreate(content="What is retrieval-augmented generation?"), uuid.uuid4()
        )
    ]

    assert events[-1] == {
        "error_code": "provider_credits",
        "error": "The AI provider's credits are exhausted — try again later.",
    }
    assert not any("done" in e or "delta" in e for e in events)

    saved = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], ChatMessage)]
    assert [m.role for m in saved] == [MessageRole.user]


async def test_local_embedding_fallback_logs_warning(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    warning = MagicMock()
    monkeypatch.setattr(embedding_service.logger, "warning", warning)

    vectors = await embedding_service.generate_embeddings(["hello world"])

    assert len(vectors) == 1 and len(vectors[0]) == settings.EMBEDDING_DIMENSIONS
    message = warning.call_args.args[0]
    assert "semantic search quality is degraded" in message
    assert warning.call_args.kwargs["reason"] == "GEMINI_API_KEY is not configured"
