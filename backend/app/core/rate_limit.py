"""
Core Rate Limiting Engine for AI Research Workspace.

Features:
- In-memory thread-safe sliding window rate limiting.
- Dual-mode client identification:
  * Authenticated: keyed by user ID (extracted from JWT Bearer token or request state).
  * Unauthenticated: keyed by client IP (with X-Forwarded-For / X-Real-IP proxy support).
- Standard rate limit response headers (RFC compliant):
  * X-RateLimit-Limit: Maximum requests allowed in the current window.
  * X-RateLimit-Remaining: Requests remaining in the current window.
  * X-RateLimit-Reset: Unix timestamp when the current window resets.
  * Retry-After: Seconds before the client may retry (on HTTP 429).
- Endpoint-level dependencies for FastAPI routers.
- Pipeline & Service-level guards across LLM calls, Graph DB queries, Embedding generation, and RAG retrieval.
- Comprehensive registry to inspect and list all active rate limits.
"""

import math
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import Request, Response

from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.core.logging import get_logger
from app.core.security import decode_access_token

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Sliding Window In-Memory Backend
# ---------------------------------------------------------------------------
class SlidingWindowLimiter:
    """
    High-performance thread-safe sliding-window rate limiter.
    Maintains a rolling log of request timestamps per key.
    """

    def __init__(self) -> None:
        self._history: Dict[str, List[float]] = {}
        self._lock = threading.Lock()
        self._last_cleanup = time.time()
        self._cleanup_interval = 60.0  # Run cleanup every 60 seconds

    def check_and_record(
        self,
        key: str,
        limit: int,
        window: int,
    ) -> Tuple[bool, int, int, int]:
        """
        Check if an incoming request is allowed and record it.

        Args:
            key: Unique rate-limit bucket identifier (e.g., 'user:<uuid>:<scope>').
            limit: Maximum allowed requests within the time window.
            window: Time window duration in seconds.

        Returns:
            Tuple of:
                allowed (bool): True if request is under limit, False otherwise.
                remaining (int): Requests remaining in current window.
                reset_time (int): Unix timestamp when window resets / oldest expires.
                retry_after (int): Seconds until next request slot opens.
        """
        now = time.time()
        cutoff = now - float(window)

        with self._lock:
            # Periodic cleanup of expired entries
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup_locked(now)

            timestamps = self._history.get(key, [])
            # Prune timestamps older than window cutoff
            timestamps = [t for t in timestamps if t > cutoff]

            reset_time = int(timestamps[0] + window) if timestamps else int(now + window)

            if len(timestamps) >= limit:
                # Limit exceeded: calculate retry-after from oldest timestamp in window
                oldest = timestamps[0]
                retry_after = max(1, int(math.ceil(oldest + window - now)))
                self._history[key] = timestamps
                return False, 0, reset_time, retry_after

            # Request allowed: record timestamp
            timestamps.append(now)
            self._history[key] = timestamps
            remaining = max(0, limit - len(timestamps))
            return True, remaining, reset_time, 0

    def _cleanup_locked(self, now: float) -> None:
        """Purge idle keys that have no timestamps within the last 300 seconds."""
        stale_cutoff = now - 300.0
        keys_to_delete = []
        for k, ts_list in self._history.items():
            valid_ts = [t for t in ts_list if t > stale_cutoff]
            if not valid_ts:
                keys_to_delete.append(k)
            else:
                self._history[k] = valid_ts
        for k in keys_to_delete:
            self._history.pop(k, None)
        self._last_cleanup = now

    def reset(self) -> None:
        """Reset all rate limit tracking history (primarily for tests)."""
        with self._lock:
            self._history.clear()
            self._last_cleanup = time.time()


# Global rate limit storage backend
limiter_backend = SlidingWindowLimiter()


# ---------------------------------------------------------------------------
# Client Identification Helper
# ---------------------------------------------------------------------------
def extract_client_identifier(request: Request) -> str:
    """
    Resolve client identifier for rate limiting:
    1. Check if user ID is stored on request.state.user_id.
    2. Extract and decode Bearer JWT token from Authorization header if present.
    3. Fallback to client IP address (checking X-Forwarded-For and X-Real-IP).
    """
    # 1. State user_id if already populated by prior middleware/dependency
    state_user_id = getattr(request.state, "user_id", None)
    if state_user_id:
        return f"user:{state_user_id}"

    # 2. Check Authorization Bearer header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            payload = decode_access_token(token)
            user_id = payload.get("sub")
            if user_id:
                request.state.user_id = str(user_id)
                return f"user:{user_id}"
        except Exception:
            # Invalid/expired token; proceed to IP identification
            pass

    # 3. Client IP resolution (with reverse proxy support)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
        if client_ip:
            return f"ip:{client_ip}"

    real_ip = request.headers.get("X-Real-IP")
    if real_ip and real_ip.strip():
        return f"ip:{real_ip.strip()}"

    if request.client and request.client.host:
        return f"ip:{request.client.host}"

    return "ip:unknown"


# ---------------------------------------------------------------------------
# Rate Limit Metadata Registry
# ---------------------------------------------------------------------------
RATE_LIMIT_REGISTRY: List[Dict[str, Any]] = []


# ---------------------------------------------------------------------------
# FastAPI Route Dependency
# ---------------------------------------------------------------------------
class RateLimiter:
    """
    FastAPI endpoint dependency for enforcing rate limits.

    Usage:
        @router.post("/items", dependencies=[Depends(RateLimiter(requests=10, window=60, scope="items:create"))])
    """

    def __init__(
        self,
        requests: int,
        window: int = 60,
        scope: str = "default",
        description: str = "",
        category: str = "endpoint",
        key_func: Optional[Callable[[Request], str]] = None,
    ) -> None:
        self.requests = requests
        self.window = window
        self.scope = scope
        self.description = description or f"Limits requests to {requests} per {window}s for {scope}"
        self.category = category
        self.key_func = key_func

        # Register in metadata registry for introspection
        RATE_LIMIT_REGISTRY.append(
            {
                "scope": self.scope,
                "limit": self.requests,
                "window_seconds": self.window,
                "category": self.category,
                "description": self.description,
            }
        )

    async def __call__(self, request: Request, response: Response) -> None:
        # Check if rate limiting is globally disabled
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return

        client_id = self.key_func(request) if self.key_func else extract_client_identifier(request)
        rate_key = f"{client_id}:{self.scope}"

        allowed, remaining, reset_time, retry_after = limiter_backend.check_and_record(
            key=rate_key,
            limit=self.requests,
            window=self.window,
        )

        # Set standard rate-limiting headers on response
        response.headers["X-RateLimit-Limit"] = str(self.requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_time)

        if not allowed:
            logger.warning(
                "Rate limit exceeded",
                scope=self.scope,
                client=client_id,
                limit=self.requests,
                retry_after=retry_after,
            )
            raise RateLimitError(
                message=f"Rate limit exceeded for '{self.scope}'. Allowed: {self.requests} requests per {self.window}s. Try again in {retry_after} seconds.",
                retry_after=retry_after,
                details={
                    "scope": self.scope,
                    "limit": self.requests,
                    "window_seconds": self.window,
                    "remaining": 0,
                    "retry_after": retry_after,
                    "reset_timestamp": reset_time,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_time),
                },
            )


# ---------------------------------------------------------------------------
# Pipeline-level Service Guards
# ---------------------------------------------------------------------------
def enforce_pipeline_rate_limit(
    scope: str,
    limit: int,
    window: int = 60,
    identifier: Optional[str] = None,
    description: str = "",
) -> None:
    """
    Enforces a rate limit for internal pipeline operations (LLM calls, Graph DB queries,
    Embedding generation, RAG hybrid retrieval).

    Args:
        scope: Pipeline scope name (e.g., 'pipeline:llm', 'pipeline:embedding').
        limit: Max calls permitted in the time window.
        window: Window duration in seconds (default 60s).
        identifier: User ID or client key. If None, applies to 'global'.
        description: Description of the operation.

    Raises:
        RateLimitError: If the pipeline limit is exceeded.
    """
    if not getattr(settings, "RATE_LIMIT_ENABLED", True):
        return

    client_id = f"user:{identifier}" if identifier else "global"
    rate_key = f"{client_id}:{scope}"

    allowed, remaining, reset_time, retry_after = limiter_backend.check_and_record(
        key=rate_key,
        limit=limit,
        window=window,
    )

    if not allowed:
        logger.warning(
            "Pipeline rate limit exceeded",
            scope=scope,
            client=client_id,
            limit=limit,
            retry_after=retry_after,
        )
        raise RateLimitError(
            message=f"Pipeline rate limit exceeded for '{scope}'. Allowed: {limit} calls per {window}s. Please retry in {retry_after} seconds.",
            retry_after=retry_after,
            details={
                "scope": scope,
                "limit": limit,
                "window_seconds": window,
                "remaining": 0,
                "retry_after": retry_after,
                "reset_timestamp": reset_time,
            },
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_time),
            },
        )


# ---------------------------------------------------------------------------
# Pre-configured Rate Limiters for All Backend Endpoints
# ---------------------------------------------------------------------------

# ── Auth Endpoints ──────────────────────────────────────────────────────────
rate_limit_auth_login = RateLimiter(
    requests=settings.RATE_LIMIT_AUTH_LOGIN,
    window=60,
    scope="auth:login",
    description="Protects against brute-force password login attempts (keyed by IP)",
    category="auth",
)

rate_limit_auth_register = RateLimiter(
    requests=settings.RATE_LIMIT_AUTH_REGISTER,
    window=60,
    scope="auth:register",
    description="Protects against automated bot registrations (keyed by IP)",
    category="auth",
)

rate_limit_auth_me = RateLimiter(
    requests=settings.RATE_LIMIT_AUTH_ME,
    window=60,
    scope="auth:me",
    description="Rate limits profile retrieval for current authenticated user",
    category="auth",
)

rate_limit_auth_logout = RateLimiter(
    requests=settings.RATE_LIMIT_AUTH_LOGOUT,
    window=60,
    scope="auth:logout",
    description="Limits logout endpoint calls",
    category="auth",
)

rate_limit_auth_google = RateLimiter(
    requests=settings.RATE_LIMIT_AUTH_GOOGLE,
    window=60,
    scope="auth:google",
    description="Limits Google ID-token sign-in attempts (keyed by IP)",
    category="auth",
)

# ── Users Endpoints ─────────────────────────────────────────────────────────
rate_limit_users_update = RateLimiter(
    requests=settings.RATE_LIMIT_USERS_UPDATE,
    window=60,
    scope="users:update",
    description="Limits user account profile updates",
    category="users",
)

# ── Sources & Ingestion Endpoints ───────────────────────────────────────────
rate_limit_sources_ingest = RateLimiter(
    requests=settings.RATE_LIMIT_SOURCES_INGEST,
    window=60,
    scope="sources:ingest",
    description="Heavy ingestion: scraping, chunking, Gemini embeddings, and Neo4j graph entity extraction",
    category="sources",
)

rate_limit_sources_read = RateLimiter(
    requests=settings.RATE_LIMIT_SOURCES_READ,
    window=60,
    scope="sources:read",
    description="Listing and fetching user research sources",
    category="sources",
)

rate_limit_sources_delete = RateLimiter(
    requests=settings.RATE_LIMIT_SOURCES_DELETE,
    window=60,
    scope="sources:delete",
    description="Deleting sources and indexed chunks",
    category="sources",
)

# ── Chat & Sessions Endpoints ───────────────────────────────────────────────
rate_limit_chat_stream = RateLimiter(
    requests=settings.RATE_LIMIT_CHAT_STREAM,
    window=60,
    scope="chat:stream",
    description="Streaming LangGraph AI agent execution, Gemini LLM reasoning, RAG vector retrieval, and web search",
    category="chat",
)

rate_limit_chat_history = RateLimiter(
    requests=settings.RATE_LIMIT_CHAT_HISTORY,
    window=60,
    scope="chat:history",
    description="Fetching session message logs and citations",
    category="chat",
)

rate_limit_sessions_create = RateLimiter(
    requests=settings.RATE_LIMIT_SESSIONS_CREATE,
    window=60,
    scope="sessions:create",
    description="Creating new research sessions",
    category="sessions",
)

rate_limit_sessions_read = RateLimiter(
    requests=settings.RATE_LIMIT_SESSIONS_READ,
    window=60,
    scope="sessions:read",
    description="Listing and reading research sessions",
    category="sessions",
)

rate_limit_sessions_update = RateLimiter(
    requests=settings.RATE_LIMIT_SESSIONS_UPDATE,
    window=60,
    scope="sessions:update",
    description="Updating session metadata or title",
    category="sessions",
)

rate_limit_sessions_delete = RateLimiter(
    requests=settings.RATE_LIMIT_SESSIONS_DELETE,
    window=60,
    scope="sessions:delete",
    description="Deleting research sessions",
    category="sessions",
)

# ── Knowledge Graph & Memory Endpoints ──────────────────────────────────────
rate_limit_knowledge_interact = RateLimiter(
    requests=settings.RATE_LIMIT_KNOWLEDGE_INTERACT,
    window=60,
    scope="knowledge:interact",
    description="Recording user memory interaction (likes, curious_about, explores) in Neo4j",
    category="knowledge",
)

rate_limit_knowledge_curiosity = RateLimiter(
    requests=settings.RATE_LIMIT_KNOWLEDGE_CURIOSITY,
    window=60,
    scope="knowledge:curiosity",
    description="Traverses Neo4j graph and invokes Gemini LLM to synthesize proactive curiosity prompts",
    category="knowledge",
)

rate_limit_knowledge_graphs = RateLimiter(
    requests=settings.RATE_LIMIT_KNOWLEDGE_GRAPHS,
    window=60,
    scope="knowledge:graphs",
    description="Retrieving universal, memory, or document subgraphs from Neo4j",
    category="knowledge",
)

# ── Test Graph & Lab Endpoints ──────────────────────────────────────────────
rate_limit_test_extract = RateLimiter(
    requests=settings.RATE_LIMIT_TEST_EXTRACT,
    window=60,
    scope="test:extract",
    description="Test graph extraction pipeline (LLM extraction + Neo4j write)",
    category="test_graph",
)

rate_limit_test_retrieve = RateLimiter(
    requests=settings.RATE_LIMIT_TEST_RETRIEVE,
    window=60,
    scope="test:retrieve",
    description="Test hybrid RAG search (Embedding generation + pgVector cosine distance + Neo4j + reranking)",
    category="test_graph",
)

rate_limit_test_memory = RateLimiter(
    requests=settings.RATE_LIMIT_TEST_MEMORY,
    window=60,
    scope="test:memory",
    description="Test user memory recording in Neo4j",
    category="test_graph",
)

rate_limit_test_curiosity = RateLimiter(
    requests=settings.RATE_LIMIT_TEST_CURIOSITY,
    window=60,
    scope="test:curiosity",
    description="Test curiosity engine prompt synthesis",
    category="test_graph",
)

# ── Health Probes ───────────────────────────────────────────────────────────
rate_limit_health = RateLimiter(
    requests=settings.RATE_LIMIT_HEALTH,
    window=60,
    scope="health:live",
    description="Liveness probe rate limit (keyed by IP)",
    category="health",
)

rate_limit_health_ready = RateLimiter(
    requests=settings.RATE_LIMIT_HEALTH_READY,
    window=60,
    scope="health:ready",
    description="Readiness probe with database connectivity check (keyed by IP)",
    category="health",
)


# ---------------------------------------------------------------------------
# Rate Limits Introspection
# ---------------------------------------------------------------------------
def get_all_rate_limits() -> List[Dict[str, Any]]:
    """
    Returns a catalog of all registered endpoint and pipeline rate limits.
    """
    # Endpoint limits from registry
    limits = list(RATE_LIMIT_REGISTRY)

    # Append pipeline safety limits
    limits.extend(
        [
            {
                "scope": "pipeline:llm",
                "limit": settings.PIPELINE_LLM_RPM,
                "window_seconds": 60,
                "category": "pipeline",
                "description": "Pipeline Gemini LLM call safety limit across LangGraph, extraction, and curiosity prompts",
            },
            {
                "scope": "pipeline:embedding",
                "limit": settings.PIPELINE_EMBEDDING_RPM,
                "window_seconds": 60,
                "category": "pipeline",
                "description": "Pipeline embedding generation safety limit across ingestion and semantic queries",
            },
            {
                "scope": "pipeline:graph_db",
                "limit": settings.PIPELINE_GRAPH_RPM,
                "window_seconds": 60,
                "category": "pipeline",
                "description": "Pipeline Neo4j read/write query safety limit across all graph services",
            },
            {
                "scope": "pipeline:rag_retrieval",
                "limit": settings.PIPELINE_RAG_RPM,
                "window_seconds": 60,
                "category": "pipeline",
                "description": "Pipeline hybrid RAG retrieval safety limit across vector search and reranking",
            },
        ]
    )
    return limits
