import pytest
from httpx import AsyncClient
from typing import AsyncGenerator

from app.main import app


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        yield client
