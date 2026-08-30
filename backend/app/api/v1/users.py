"""User API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.users import UserResponse, UserUpdate

router = APIRouter()


@router.patch("/me", response_model=dict)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the currently authenticated user."""
    if data.name is not None:
        current_user.name = data.name

    await db.commit()
    await db.refresh(current_user)

    return {"data": UserResponse.model_validate(current_user).model_dump(mode="json"), "meta": {}}
