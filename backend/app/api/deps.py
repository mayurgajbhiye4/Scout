"""
FastAPI dependency injection providers.

Provides database sessions, authenticated user resolution, and workspace
ownership verification as injectable dependencies.
"""

from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, AuthorizationError, NotFoundError
from app.core.security import JWTError, decode_access_token
from app.db.session import get_db


async def get_current_user_id(authorization: str = Header(...)) -> UUID:
    """Extract and validate the user ID from the Authorization header.

    Expects: ``Authorization: Bearer <token>``
    """
    if not authorization.startswith("Bearer "):
        raise AuthenticationError("Missing or malformed Authorization header")

    token = authorization[7:]
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise AuthenticationError("Token missing subject claim")
        return UUID(user_id)
    except (JWTError, ValueError) as exc:
        raise AuthenticationError("Invalid or expired token") from exc


async def get_current_user(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Resolve the full User ORM object from the authenticated user ID."""
    from app.db.models.user import User

    result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if user is None:
        raise AuthenticationError("User not found or inactive")
    return user


async def verify_workspace_owner(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Verify the authenticated user owns the specified workspace."""
    from app.db.models.workspace import Workspace

    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if workspace is None:
        raise NotFoundError("Workspace", str(workspace_id))
    if workspace.user_id != user_id:
        raise AuthorizationError("You do not own this workspace")
    return workspace
