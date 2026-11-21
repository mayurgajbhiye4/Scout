"""Safe download of a user-supplied URL, shared by every URL extractor.

Every redirect hop gets the SSRF check, not just the first URL, and the body is capped at
MAX_UPLOAD_SIZE_MB so a huge file can't exhaust memory.
"""

from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.utils.text_security import ensure_public_url

MAX_REDIRECTS = 5
FETCH_TIMEOUT_SECONDS = 15.0


class ExtractionError(Exception):
    """Extraction failed for a reason the user can act on. The message is shown on the source."""


class UnsupportedFormatError(ExtractionError):
    """The file is a format the library doesn't read at all (an image, a legacy .doc, ...)."""


@dataclass(frozen=True)
class FetchedDocument:
    url: str  # final URL, after redirects
    content_type: str  # media type from the response, lowercased, without parameters ("" if absent)
    charset: str | None
    body: bytes


async def fetch_url(url: str, max_bytes: int | None = None) -> FetchedDocument:
    limit = max_bytes or settings.max_upload_bytes
    too_large = ExtractionError(
        f"The file is larger than the {limit // (1024 * 1024)} MB limit, so it wasn't added."
    )

    # Redirects are followed by hand so every hop gets the SSRF check
    async with httpx.AsyncClient(follow_redirects=False, timeout=FETCH_TIMEOUT_SECONDS) as client:
        for _ in range(MAX_REDIRECTS + 1):
            await ensure_public_url(url)
            async with client.stream("GET", url) as response:
                if response.is_redirect and response.next_request is not None:
                    url = str(response.next_request.url)
                    last_request = response.request
                    continue
                response.raise_for_status()

                declared = response.headers.get("content-length", "")
                if declared.isdigit() and int(declared) > limit:
                    raise too_large
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise too_large

                content_type = response.headers.get("content-type", "")
                return FetchedDocument(
                    url=url,
                    content_type=content_type.split(";")[0].strip().lower(),
                    charset=response.charset_encoding,
                    body=bytes(body),
                )

    raise httpx.TooManyRedirects(f"More than {MAX_REDIRECTS} redirects", request=last_request)
