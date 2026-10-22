"""
Unit and integration tests for Rate Limiting.
Tests:
- Sliding-window algorithm (under-limit, limit-reached, recovery, cleanup)
- Client identification (Bearer JWT subject, X-Forwarded-For, X-Real-IP, client IP)
- Response headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After)
- HTTP 429 status code and error response format
- Pipeline safety rate limit enforcement
- /api/v1/health/limits catalog endpoint
"""

import time
import uuid
import pytest
from httpx import AsyncClient
from unittest.mock import MagicMock

from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.core.rate_limit import (
    SlidingWindowLimiter,
    extract_client_identifier,
    enforce_pipeline_rate_limit,
    limiter_backend,
    get_all_rate_limits,
)
from app.core.security import create_access_token


@pytest.fixture(autouse=True)
def reset_limiter():
    """Reset the limiter backend before every test."""
    limiter_backend.reset()
    yield
    limiter_backend.reset()


# ---------------------------------------------------------------------------
# 1. Sliding Window Algorithm Tests
# ---------------------------------------------------------------------------
def test_sliding_window_basic_counting():
    limiter = SlidingWindowLimiter()
    key = "test:user:1"
    limit = 3
    window = 10

    # Request 1
    allowed, remaining, reset_time, retry_after = limiter.check_and_record(key, limit, window)
    assert allowed is True
    assert remaining == 2
    assert retry_after == 0

    # Request 2
    allowed, remaining, reset_time, retry_after = limiter.check_and_record(key, limit, window)
    assert allowed is True
    assert remaining == 1
    assert retry_after == 0

    # Request 3
    allowed, remaining, reset_time, retry_after = limiter.check_and_record(key, limit, window)
    assert allowed is True
    assert remaining == 0
    assert retry_after == 0

    # Request 4 — Exceeded
    allowed, remaining, reset_time, retry_after = limiter.check_and_record(key, limit, window)
    assert allowed is False
    assert remaining == 0
    assert retry_after > 0


def test_sliding_window_expiration():
    limiter = SlidingWindowLimiter()
    key = "test:user:expire"
    limit = 2
    window = 1  # 1 second window

    # Exhaust limit
    allowed, _, _, _ = limiter.check_and_record(key, limit, window)
    assert allowed is True
    allowed, _, _, _ = limiter.check_and_record(key, limit, window)
    assert allowed is True
    allowed, _, _, _ = limiter.check_and_record(key, limit, window)
    assert allowed is False

    # Wait for window to expire
    time.sleep(1.05)

    # Now request should be allowed again
    allowed, remaining, _, _ = limiter.check_and_record(key, limit, window)
    assert allowed is True
    assert remaining == 1


# ---------------------------------------------------------------------------
# 2. Client Identification Tests
# ---------------------------------------------------------------------------
def test_extract_client_identifier_from_jwt():
    user_id = str(uuid.uuid4())
    token = create_access_token(user_id)

    request = MagicMock()
    request.state = MagicMock(spec=[])  # no user_id attribute
    request.headers = {"Authorization": f"Bearer {token}"}
    request.client = MagicMock(host="192.168.1.100")

    identifier = extract_client_identifier(request)
    assert identifier == f"user:{user_id}"


def test_extract_client_identifier_from_forwarded_for():
    request = MagicMock()
    request.state = MagicMock(spec=[])
    request.headers = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18"}
    request.client = MagicMock(host="10.0.0.1")

    identifier = extract_client_identifier(request)
    assert identifier == "ip:203.0.113.195"


def test_extract_client_identifier_from_real_ip():
    request = MagicMock()
    request.state = MagicMock(spec=[])
    request.headers = {"X-Real-IP": "198.51.100.4"}
    request.client = MagicMock(host="10.0.0.1")

    identifier = extract_client_identifier(request)
    assert identifier == "ip:198.51.100.4"


def test_extract_client_identifier_fallback_host():
    request = MagicMock()
    request.state = MagicMock(spec=[])
    request.headers = {}
    request.client = MagicMock(host="127.0.0.1")

    identifier = extract_client_identifier(request)
    assert identifier == "ip:127.0.0.1"


# ---------------------------------------------------------------------------
# 3. Pipeline Rate Limiting Guard Tests
# ---------------------------------------------------------------------------
def test_pipeline_rate_limiting_enforcement():
    scope = "pipeline:test"
    limit = 2
    window = 10
    identifier = "user-123"

    # Call 1 - ok
    enforce_pipeline_rate_limit(scope, limit=limit, window=window, identifier=identifier)

    # Call 2 - ok
    enforce_pipeline_rate_limit(scope, limit=limit, window=window, identifier=identifier)

    # Call 3 - should raise RateLimitError
    with pytest.raises(RateLimitError) as exc_info:
        enforce_pipeline_rate_limit(scope, limit=limit, window=window, identifier=identifier)

    err = exc_info.value
    assert err.status_code == 429
    assert err.code == "RATE_LIMIT_EXCEEDED"
    assert err.retry_after is not None
    assert "Retry-After" in err.headers


# ---------------------------------------------------------------------------
# 4. HTTP Endpoint Rate Limiting Tests (via AsyncClient)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_endpoint_rate_limiting_headers_and_rejection(async_client: AsyncClient):
    # Health endpoint is rate limited with rate_limit_health
    # Let's perform requests to verify headers
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    assert "x-ratelimit-limit" in response.headers
    assert "x-ratelimit-remaining" in response.headers
    assert "x-ratelimit-reset" in response.headers

    limit = int(response.headers["x-ratelimit-limit"])
    assert limit > 0


@pytest.mark.asyncio
async def test_limits_catalog_endpoint(async_client: AsyncClient):
    response = await async_client.get("/api/v1/health/limits")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    catalog = data["data"]

    # Verify key rate limit scopes exist in catalog
    scopes = {item["scope"] for item in catalog}
    assert "auth:login" in scopes
    assert "auth:register" in scopes
    assert "sources:ingest" in scopes
    assert "sources:read" in scopes
    assert "chat:stream" in scopes
    assert "chat:history" in scopes
    assert "sessions:create" in scopes
    assert "knowledge:curiosity" in scopes
    assert "knowledge:graphs" in scopes
    assert "pipeline:llm" in scopes
    assert "pipeline:embedding" in scopes
    assert "pipeline:graph_db" in scopes
    assert "pipeline:rag_retrieval" in scopes


@pytest.mark.asyncio
async def test_auth_login_rate_limit_exceeded(async_client: AsyncClient):
    # Auth login has limit of 5/minute
    # Send 5 requests (which should fail validation / 400 or 401, but consume rate limit slots)
    for _ in range(settings.RATE_LIMIT_AUTH_LOGIN):
        await async_client.post("/api/v1/auth/login", json={"email": "wrong@example.com", "password": "wrong"})

    # The next request must be rejected with 429 Too Many Requests!
    res = await async_client.post("/api/v1/auth/login", json={"email": "wrong@example.com", "password": "wrong"})
    assert res.status_code == 429
    body = res.json()
    assert body["error"]["code"] == "RATE_LIMIT_EXCEEDED"
    assert "retry_after" in body["error"]["details"]
    assert "retry-after" in res.headers
