"""
Health check endpoints.

- GET /health     — liveness probe (always returns OK)
- GET /health/ready — readiness probe (verifies database connectivity)
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter()


@router.get("")
async def health() -> dict:
    """Liveness probe — the application process is running."""
    return {"data": {"status": "healthy"}, "meta": {}}


@router.get("/ready")
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
