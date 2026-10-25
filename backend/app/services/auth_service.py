"""
Authentication service — user registration, login, and token management.
"""

import asyncio
from uuid import UUID

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException, AuthenticationError, ConflictError
from app.core.logging import get_logger
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models.oauth_account import OAuthAccount
from app.db.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

logger = get_logger(__name__)

GOOGLE_PROVIDER = "google"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

# Reused across requests so Google's signing certs are fetched over a pooled session
_google_request = google_requests.Request()


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(self, data: RegisterRequest) -> User:
        """Register a new user. Raises ConflictError if email already exists."""
        existing = await self.db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(f"User with email '{data.email}' already exists")

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            name=data.name,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        logger.info("User registered", user_id=str(user.id), email=user.email)
        return user

    async def login(self, data: LoginRequest) -> TokenResponse:
        """Authenticate a user and return a JWT token."""
        result = await self.db.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()

        # Google-only accounts have no password hash and cannot use password login
        if user is None or not user.password_hash or not verify_password(data.password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            raise AuthenticationError("Account is deactivated")

        token = create_access_token(subject=str(user.id))

        logger.info("User logged in", user_id=str(user.id))
        return TokenResponse(access_token=token)

    async def google_login(self, credential: str) -> TokenResponse:
        """Verify a Google ID token, find/link/create the user, and return a JWT.

        Resolution order:
          1. Existing Google OAuthAccount (matched by Google's stable ``sub``).
          2. Existing user with the same verified email — the Google account is linked.
          3. Otherwise a new passwordless user is created.
        """
        if not settings.GOOGLE_CLIENT_ID:
            raise AppException("GOOGLE_AUTH_DISABLED", "Google sign-in is not configured", 503)

        claims = await self._verify_google_token(credential)

        google_sub: str = claims["sub"]
        email: str | None = claims.get("email")
        if not email or not claims.get("email_verified"):
            raise AuthenticationError("Google account email is not verified")
        email = email.lower()

        result = await self.db.execute(
            select(OAuthAccount).where(
                OAuthAccount.provider == GOOGLE_PROVIDER,
                OAuthAccount.provider_account_id == google_sub,
            )
        )
        account = result.scalar_one_or_none()

        if account is not None:
            user = await self.db.get(User, account.user_id)
        else:
            result = await self.db.execute(select(User).where(func.lower(User.email) == email))
            user = result.scalar_one_or_none()
            if user is None:
                user = User(
                    email=email,
                    name=claims.get("name") or email.split("@")[0],
                    avatar_url=claims.get("picture"),
                    password_hash=None,
                    is_active=True,
                )
                self.db.add(user)
                await self.db.flush()
                logger.info("User registered via Google", user_id=str(user.id), email=email)
            self.db.add(
                OAuthAccount(user_id=user.id, provider=GOOGLE_PROVIDER, provider_account_id=google_sub)
            )

        if user is None or not user.is_active:
            raise AuthenticationError("Account is deactivated")

        if not user.avatar_url and claims.get("picture"):
            user.avatar_url = claims["picture"]

        await self.db.commit()

        logger.info("User logged in via Google", user_id=str(user.id))
        return TokenResponse(access_token=create_access_token(subject=str(user.id)))

    @staticmethod
    async def _verify_google_token(credential: str) -> dict:
        """Validate signature, audience, expiry and issuer of a Google ID token."""
        try:
            # verify_oauth2_token does blocking HTTP (cert fetch) — keep it off the event loop
            claims = await asyncio.to_thread(
                google_id_token.verify_oauth2_token,
                credential,
                _google_request,
                settings.GOOGLE_CLIENT_ID,
            )
        except ValueError as exc:
            raise AuthenticationError("Invalid Google credential") from exc

        if claims.get("iss") not in GOOGLE_ISSUERS:
            raise AuthenticationError("Invalid Google credential issuer")
        return claims

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        """Retrieve a user by their ID."""
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_active.is_(True))
        )
        return result.scalar_one_or_none()
