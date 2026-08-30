"""
API tests for health and basic endpoint connectivity.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_ready(async_client: AsyncClient):
    response = await async_client.get("/api/v1/health/ready")
    assert response.status_code in (200, 503)  # 503 if DB is offline during testing
