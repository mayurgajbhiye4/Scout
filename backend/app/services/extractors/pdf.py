"""PDF extractor: the text layer of a PDF, page by page, via pypdf (BSD-licensed, pure Python)."""

import asyncio
import io

from pypdf import PdfReader

from app.core.logging import get_logger

from .base import BaseExtractor
from .fetch import ExtractionError

logger = get_logger(__name__)

PDF_MAGIC = b"%PDF-"


def looks_like_pdf(body: bytes) -> bool:
    # The spec lets the header sit anywhere in the first 1024 bytes
    return PDF_MAGIC in body[:1024]


class PdfExtractor(BaseExtractor):
    """Extract text and metadata from PDF bytes."""

    async def extract(self, source: bytes) -> dict:
        # Parsing is CPU-bound; keep it off the event loop
        return await asyncio.to_thread(_extract_pdf, source)


def _open_pdf(data: bytes) -> PdfReader:
    try:
        reader = PdfReader(io.BytesIO(data))
        encrypted = reader.is_encrypted
    except Exception as err:
        raise ExtractionError("This PDF couldn't be read. The file may be damaged.") from err
    if encrypted:
        # Many PDFs are encrypted only to restrict printing or copying, with an empty open password
        try:
            opened = reader.decrypt("")
        except Exception:
            opened = 0
        if not opened:
            raise ExtractionError("This PDF is password-protected, so its text can't be read.")
    return reader


def _extract_pdf(data: bytes) -> dict:
    reader = _open_pdf(data)
    try:
        page_count = len(reader.pages)
    except Exception as err:
        raise ExtractionError("This PDF couldn't be read. The file may be damaged.") from err

    pages = []
    for number, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as err:
            # One broken page shouldn't lose the rest of the document
            logger.warning("Skipping unreadable PDF page", page=number, error=str(err))
            continue
        if text.strip():
            pages.append(text.strip())

    if not pages:
        raise ExtractionError(
            "This PDF has no selectable text (it may be a scanned image), so there is nothing to index."
        )

    title = author = ""
    try:
        if reader.metadata:
            title = (reader.metadata.title or "").strip()
            author = (reader.metadata.author or "").strip()
    except Exception as err:
        # Malformed metadata isn't worth failing over
        logger.info("Ignoring unreadable PDF metadata", error=str(err))

    return {
        "text": "\n\n".join(pages),
        "metadata": {
            "title": title,
            "author": author,
            "page_count": page_count,
            "extractor": "PdfExtractor",
        },
    }
