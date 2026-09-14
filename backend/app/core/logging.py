"""
Structured logging with structlog.

Provides JSON-formatted logs in production and human-readable colored output
in development. Every log entry carries request_id, user_id, and workspace_id
when available.

Noise policy
------------
* sqlalchemy.engine  — WARNING only (no SQL echoing)
* uvicorn.access     — WARNING (raw access lines replaced by our middleware)
* httpx, passlib, bcrypt, passlib.handlers — WARNING

These are silenced at *import time* so they never reach the root handler
regardless of when setup_logging() is called.
"""

import logging
import sys
import time
from typing import Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

# ---------------------------------------------------------------------------
# Silence noisy third-party loggers immediately at import time.
# setup_logging() might be called later (in lifespan), but SQLAlchemy and
# other libs start logging as soon as they are imported.
# ---------------------------------------------------------------------------
_SILENT_LOGGERS = (
    "sqlalchemy.engine",
    "sqlalchemy.engine.base",
    "sqlalchemy.pool",
    "sqlalchemy.dialects",
    "uvicorn.access",
    "uvicorn.error",
    "httpx",
    "httpcore",
    "passlib",
    "passlib.handlers.bcrypt",
    "bcrypt",
)

for _name in _SILENT_LOGGERS:
    logging.getLogger(_name).setLevel(logging.WARNING)
    logging.getLogger(_name).propagate = False  # Don't bubble to root either


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

def setup_logging() -> None:
    """Configure structlog processors and stdlib logging integration."""
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if settings.APP_ENV in ("local", "development"):
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(colors=True)
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    # Re-apply silence after root handler is set (belt-and-suspenders)
    for name in _SILENT_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
        logging.getLogger(name).propagate = False


# ---------------------------------------------------------------------------
# Logger factory
# ---------------------------------------------------------------------------

def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a bound structured logger for the given module name."""
    return structlog.get_logger(name)


# ---------------------------------------------------------------------------
# HTTP request/response logging middleware
# ---------------------------------------------------------------------------

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request and response via structlog.

    Emits two events per request:
    - http.request  — method, path, client IP
    - http.response — method, path, status_code, duration_ms

    Skips /docs, /redoc, /openapi.json to reduce noise.
    """

    _SKIP_PATHS = {"/docs", "/redoc", "/openapi.json", "/favicon.ico"}
    _log = get_logger("http")

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path in self._SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()

        self._log.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            client=request.client.host if request.client else None,
        )

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            self._log.exception(
                "http.error",
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        level = "warning" if response.status_code >= 400 else "info"
        getattr(self._log, level)(
            "http.response",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        return response
