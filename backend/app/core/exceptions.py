"""
Application exception hierarchy.

Every exception carries a machine-readable code, a human-readable message,
an HTTP status code, and optional structured details. The FastAPI exception
handler in main.py renders these into the standard error response shape.
"""

from typing import Any


class AppException(Exception):
    """Base exception for all application-level errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class ValidationError(AppException):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__("VALIDATION_ERROR", message, 422, details)


class NotFoundError(AppException):
    def __init__(self, resource: str, resource_id: str = "") -> None:
        detail_msg = f"{resource} not found"
        if resource_id:
            detail_msg = f"{resource} '{resource_id}' not found"
        super().__init__("NOT_FOUND", detail_msg, 404)


class AuthenticationError(AppException):
    def __init__(self, message: str = "Invalid credentials") -> None:
        super().__init__("AUTHENTICATION_ERROR", message, 401)


class AuthorizationError(AppException):
    def __init__(self, message: str = "You do not have permission to access this resource") -> None:
        super().__init__("AUTHORIZATION_ERROR", message, 403)


class ConflictError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__("CONFLICT", message, 409)


class RateLimitError(AppException):
    def __init__(self, message: str = "Rate limit exceeded") -> None:
        super().__init__("RATE_LIMIT_EXCEEDED", message, 429)


class ExternalServiceError(AppException):
    def __init__(self, service: str, message: str = "External service error") -> None:
        super().__init__(
            "EXTERNAL_SERVICE_ERROR",
            f"{service}: {message}",
            502,
            {"service": service},
        )


class FileTooLargeError(AppException):
    def __init__(self, max_mb: int) -> None:
        super().__init__(
            "FILE_TOO_LARGE",
            f"File exceeds maximum allowed size of {max_mb}MB",
            413,
        )


class UnsupportedFileTypeError(AppException):
    def __init__(self, mime_type: str) -> None:
        super().__init__(
            "UNSUPPORTED_FILE_TYPE",
            f"File type '{mime_type}' is not supported",
            415,
        )
