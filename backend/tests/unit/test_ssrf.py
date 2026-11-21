"""SSRF guard: user-supplied URLs must never make the server fetch a private or internal address."""

import socket
from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.exceptions import ValidationError
from app.schemas.sources import SourceCreate
from app.services import source_service
from app.services.extractors import fetch, web
from app.utils.text_security import UnsafeURLError, ensure_public_url, validate_url_safety


def _resolving_to(*addresses):
    async def resolve(host, port):
        return list(addresses)

    return resolve


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000",
        "http://app.localhost/",
        "http://127.0.0.1:5432",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.0.1/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://metadata.google.internal/",
        "ftp://example.com/",
        "file:///etc/passwd",
    ],
)
def test_literal_internal_urls_are_refused(url):
    assert validate_url_safety(url) is False


def test_public_urls_pass():
    assert validate_url_safety("https://docs.github.com") is True
    assert validate_url_safety("https://8.8.8.8/") is True


@pytest.mark.parametrize("address", ["127.0.0.1", "10.1.2.3", "169.254.169.254", "fd00::1"])
async def test_a_domain_resolving_to_an_internal_address_is_refused(monkeypatch, address):
    monkeypatch.setattr(
        "app.utils.text_security._resolve_host", _resolving_to("93.184.216.34", address)
    )
    with pytest.raises(UnsafeURLError):
        await ensure_public_url("https://sneaky.example/")


async def test_an_unresolvable_host_is_left_to_the_fetch(monkeypatch):
    async def fail(host, port):
        raise socket.gaierror("no such host")

    monkeypatch.setattr("app.utils.text_security._resolve_host", fail)
    await ensure_public_url("https://does-not-exist.example/")


async def test_adding_an_internal_url_is_rejected_before_anything_is_saved(monkeypatch):
    db = AsyncMock()
    ingest = AsyncMock()
    monkeypatch.setattr(source_service, "ingest_source", ingest)

    with pytest.raises(ValidationError):
        await source_service.create_source(
            db, SourceCreate(url="http://169.254.169.254/latest/"), user_id=None
        )

    db.add.assert_not_called()
    ingest.assert_not_called()


def _client_with(handler):
    real = httpx.AsyncClient

    def make(**kwargs):
        return real(transport=httpx.MockTransport(handler), **kwargs)

    return make


async def test_a_redirect_to_an_internal_address_is_not_followed(monkeypatch):
    fetched = []

    def handler(request):
        fetched.append(str(request.url))
        return httpx.Response(302, headers={"Location": "http://127.0.0.1:8000/admin"})

    monkeypatch.setattr(fetch.httpx, "AsyncClient", _client_with(handler))

    with pytest.raises(UnsafeURLError):
        await web.WebExtractor().extract("https://public.example/start")
    assert fetched == ["https://public.example/start"]


async def test_safe_redirects_are_followed(monkeypatch):
    def handler(request):
        if request.url.path == "/start":
            return httpx.Response(301, headers={"Location": "/final"})
        return httpx.Response(200, text="<title>Final</title><p>Body text</p>")

    monkeypatch.setattr(fetch.httpx, "AsyncClient", _client_with(handler))

    result = await web.WebExtractor().extract("https://public.example/start")
    assert result["metadata"]["title"] == "Final"
    assert "Body text" in result["text"]


async def test_a_redirect_loop_stops(monkeypatch):
    def handler(request):
        return httpx.Response(302, headers={"Location": "https://public.example/again"})

    monkeypatch.setattr(fetch.httpx, "AsyncClient", _client_with(handler))

    with pytest.raises(httpx.TooManyRedirects):
        await web.WebExtractor().extract("https://public.example/start")
