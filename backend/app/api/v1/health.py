"""
Health check and introspection endpoints.

- GET /health        — liveness probe (always returns OK)
- GET /health/ready  — readiness probe (verifies database connectivity)
- GET /health/limits — rate limits catalog
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import (
    get_all_rate_limits,
    rate_limit_health,
    rate_limit_health_ready,
)
from app.db.session import get_db

router = APIRouter()


@router.get("", dependencies=[Depends(rate_limit_health)])
async def health() -> dict:
    """Liveness probe — the application process is running."""
    return {"data": {"status": "healthy"}, "meta": {}}


@router.get("/ready", dependencies=[Depends(rate_limit_health_ready)])
async def health_ready(db: AsyncSession = Depends(get_db)) -> dict:
    """Readiness probe — the application can serve requests (DB is reachable)."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    ready = db_status == "connected"
    return {
        "data": {
            "status": "ready" if ready else "not_ready",
            "database": db_status,
        },
        "meta": {},
    }


@router.get("/limits", dependencies=[Depends(rate_limit_health)])
async def list_rate_limits() -> dict:
    """Introspection endpoint: returns all registered endpoint and pipeline rate limits."""
    return {
        "data": get_all_rate_limits(),
        "meta": {"total": len(get_all_rate_limits())},
    }

