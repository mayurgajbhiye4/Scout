import pytest
from httpx import AsyncClient, ASGITransport
from typing import AsyncGenerator

from app.main import app


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client
