"""
Unit tests for Google sign-in.
Tests:
- /auth/google/config reflects GOOGLE_CLIENT_ID
- Disabled config, invalid tokens and unverified emails are rejected
- New user creation, linking to an existing email account, and returning-user login
- Google-only (passwordless) users cannot use password login
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.exceptions import AppException, AuthenticationError
from app.core.rate_limit import limiter_backend
from app.core.security import decode_access_token
from app.db.models.oauth_account import OAuthAccount
from app.db.models.user import User
from app.schemas.auth import LoginRequest
from app.services import auth_service as auth_module
from app.services.auth_service import AuthService

CLIENT_ID = "test-client.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def reset_limiter():
    limiter_backend.reset()
    yield
    limiter_backend.reset()


@pytest.fixture
def google_enabled(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", CLIENT_ID)


def make_claims(**overrides) -> dict:
    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-sub-123",
        "email": "Ada@Example.com",
        "email_verified": True,
        "name": "Ada Lovelace",
        "picture": "https://example.com/ada.png",
    }
    claims.update(overrides)
    return claims


def stub_verify(monkeypatch, claims: dict | None = None, error: Exception | None = None):
    def fake_verify(credential, request, audience):
        assert audience == CLIENT_ID
        if error:
            raise error
        return claims

    monkeypatch.setattr(auth_module.google_id_token, "verify_oauth2_token", fake_verify)


def scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def make_db(*execute_results, get_result=None):
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[scalar_result(v) for v in execute_results])
    db.get = AsyncMock(return_value=get_result)
    db.commit = AsyncMock()
    db.flush = AsyncMock(side_effect=lambda: None)
    return db


def added(db, model):
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], model)]


# ---------------------------------------------------------------------------
# Config endpoint
# ---------------------------------------------------------------------------
async def test_config_disabled_by_default(async_client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    res = await async_client.get("/api/v1/auth/google/config")
    assert res.status_code == 200
    assert res.json()["data"] == {"enabled": False, "client_id": None}


async def test_config_enabled(async_client: AsyncClient, google_enabled):
    res = await async_client.get("/api/v1/auth/google/config")
    assert res.json()["data"] == {"enabled": True, "client_id": CLIENT_ID}


# ---------------------------------------------------------------------------
# Rejections
# ---------------------------------------------------------------------------
async def test_rejects_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    with pytest.raises(AppException) as exc:
        await AuthService(make_db()).google_login("token")
    assert exc.value.status_code == 503


async def test_rejects_invalid_token(monkeypatch, google_enabled):
    stub_verify(monkeypatch, error=ValueError("bad signature"))
    with pytest.raises(AuthenticationError):
        await AuthService(make_db()).google_login("token")


async def test_rejects_wrong_issuer(monkeypatch, google_enabled):
    stub_verify(monkeypatch, make_claims(iss="https://evil.example.com"))
    with pytest.raises(AuthenticationError):
        await AuthService(make_db()).google_login("token")


async def test_rejects_unverified_email(monkeypatch, google_enabled):
    stub_verify(monkeypatch, make_claims(email_verified=False))
    with pytest.raises(AuthenticationError):
        await AuthService(make_db()).google_login("token")


async def test_endpoint_returns_401_for_invalid_token(async_client: AsyncClient, monkeypatch, google_enabled):
    stub_verify(monkeypatch, error=ValueError("expired"))
    res = await async_client.post("/api/v1/auth/google", json={"credential": "token"})
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Account resolution
# ---------------------------------------------------------------------------
async def test_creates_new_user(monkeypatch, google_enabled):
    stub_verify(monkeypatch, make_claims())
    db = make_db(None, None)  # no OAuth link, no user with that email

    def assign_id():
        for user in added(db, User):
            user.id = user.id or uuid.uuid4()

    db.flush = AsyncMock(side_effect=assign_id)

    token = await AuthService(db).google_login("token")

    [user] = added(db, User)
    [account] = added(db, OAuthAccount)
    assert user.email == "ada@example.com"
    assert user.name == "Ada Lovelace"
    assert user.password_hash is None
    assert account.provider == "google"
    assert account.provider_account_id == "google-sub-123"
    assert account.user_id == user.id
    assert decode_access_token(token.access_token)["sub"] == str(user.id)
    db.commit.assert_awaited_once()


async def test_links_existing_email_user(monkeypatch, google_enabled):
    stub_verify(monkeypatch, make_claims())
    existing = User(id=uuid.uuid4(), email="ada@example.com", name="Ada", password_hash="x", is_active=True)
    db = make_db(None, existing)

    token = await AuthService(db).google_login("token")

    assert added(db, User) == []
    [account] = added(db, OAuthAccount)
    assert account.user_id == existing.id
    assert existing.avatar_url == "https://example.com/ada.png"
    assert decode_access_token(token.access_token)["sub"] == str(existing.id)


async def test_returning_google_user(monkeypatch, google_enabled):
    stub_verify(monkeypatch, make_claims())
    user = User(id=uuid.uuid4(), email="ada@example.com", name="Ada", is_active=True)
    account = OAuthAccount(user_id=user.id, provider="google", provider_account_id="google-sub-123")
    db = make_db(account, get_result=user)

    token = await AuthService(db).google_login("token")

    db.add.assert_not_called()
    assert decode_access_token(token.access_token)["sub"] == str(user.id)


async def test_rejects_inactive_user(monkeypatch, google_enabled):
    stub_verify(monkeypatch, make_claims())
    user = User(id=uuid.uuid4(), email="ada@example.com", name="Ada", is_active=False)
    account = OAuthAccount(user_id=user.id, provider="google", provider_account_id="google-sub-123")
    db = make_db(account, get_result=user)

    with pytest.raises(AuthenticationError):
        await AuthService(db).google_login("token")


async def test_passwordless_user_cannot_password_login():
    user = User(id=uuid.uuid4(), email="ada@example.com", name="Ada", password_hash=None, is_active=True)
    db = make_db(user)
    with pytest.raises(AuthenticationError):
        await AuthService(db).login(LoginRequest(email="ada@example.com", password="whatever123"))
