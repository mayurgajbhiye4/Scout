"""
Authentication service — user registration, login, and token management.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError
from app.core.logging import get_logger
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

logger = get_logger(__name__)


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

        if user is None or not verify_password(data.password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            raise AuthenticationError("Account is deactivated")

        token = create_access_token(subject=str(user.id))

        logger.info("User logged in", user_id=str(user.id))
        return TokenResponse(access_token=token)

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        """Retrieve a user by their ID."""
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_active.is_(True))
        )
        return result.scalar_one_or_none()
