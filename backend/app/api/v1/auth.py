"""Authentication API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rate_limit import (
    rate_limit_auth_login,
    rate_limit_auth_register,
    rate_limit_auth_me,
    rate_limit_auth_logout,
)
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.users import UserResponse
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=dict, status_code=201, dependencies=[Depends(rate_limit_auth_register)])
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    service = AuthService(db)
    user = await service.register(data)
    return {"data": UserResponse.model_validate(user).model_dump(mode="json"), "meta": {}}


@router.post("/login", response_model=dict, dependencies=[Depends(rate_limit_auth_login)])
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate and receive a JWT access token."""
    service = AuthService(db)
    token = await service.login(data)
    return {"data": token.model_dump(), "meta": {}}


@router.get("/me", response_model=dict, dependencies=[Depends(rate_limit_auth_me)])
async def me(current_user: User = Depends(get_current_user)):
    """Get the currently authenticated user."""
    return {"data": UserResponse.model_validate(current_user).model_dump(mode="json"), "meta": {}}


@router.post("/logout", dependencies=[Depends(rate_limit_auth_logout)])
async def logout():
    """Logout — client should discard the token. Server-side is stateless."""
    return {"data": {"message": "Logged out"}, "meta": {}}

