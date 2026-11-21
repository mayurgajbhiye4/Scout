"""Reading multipart file uploads with the size cap, shared by the upload endpoints."""

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import FileTooLargeError

READ_CHUNK_BYTES = 1024 * 1024


async def read_upload(file: UploadFile) -> bytes:
    """The upload's bytes, or FileTooLargeError (413) past MAX_UPLOAD_SIZE_MB."""
    limit = settings.max_upload_bytes
    if file.size is not None and file.size > limit:
        raise FileTooLargeError(settings.MAX_UPLOAD_SIZE_MB)
    data = bytearray()
    while chunk := await file.read(READ_CHUNK_BYTES):
        data.extend(chunk)
        if len(data) > limit:
            raise FileTooLargeError(settings.MAX_UPLOAD_SIZE_MB)
    return bytes(data)
