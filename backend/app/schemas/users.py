"""User schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    # Same bounds as registration, so a profile edit can't blank the name
    name: str | None = Field(default=None, min_length=1, max_length=255)
