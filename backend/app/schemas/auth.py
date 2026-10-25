"""Authentication request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1, description="Google ID token from Google Identity Services")


class GoogleConfigResponse(BaseModel):
    enabled: bool
    client_id: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Backward compatibility aliases
Token = TokenResponse


class TokenPayload(BaseModel):
    sub: str | None = None
    exp: int | None = None
