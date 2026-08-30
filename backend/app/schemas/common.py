"""Common API response and error schemas."""

from typing import Any, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationMeta(BaseModel):
    total: int = Field(default=0, description="Total count of items")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Number of items per page")
    total_pages: int = Field(default=1, description="Total number of pages")


class ApiResponse(BaseModel, Generic[T]):
    data: T
    meta: dict[str, Any] = Field(default_factory=dict)


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ApiErrorResponse(BaseModel):
    error: ApiErrorDetail


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    database: str = "connected"
    environment: str = "development"
