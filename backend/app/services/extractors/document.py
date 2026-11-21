"""Extracts PDF, Word (.docx), web page and text content from a URL or from uploaded bytes.

The format is decided from the file's first bytes, not from the URL, file name or Content-Type:
links like arxiv.org/pdf/<id> have no extension, and many servers label PDFs as
application/octet-stream. `metadata["format"]` reports what was found: "pdf", "docx", "html", "txt"
or "markdown".
"""

from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

import charset_normalizer

from .fetch import ExtractionError, UnsupportedFormatError, fetch_url
from .pdf import PdfExtractor, looks_like_pdf
from .web import WebExtractor
from .word import DocxExtractor, looks_like_docx, looks_like_legacy_office

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
LEGACY_DOC_ERROR = (
    "Older Word (.doc) files aren't supported. Save it as .docx or PDF and add that instead."
)
# Uploads accept only PDF and Word (recognised from their bytes) and these text files (by extension;
# a text/* Content-Type isn't enough, since CSV and HTML are text/* too)
TEXT_EXTENSIONS = {".txt": "txt", ".md": "markdown", ".markdown": "markdown"}
UNSUPPORTED_UPLOAD = (
    "{name} can't be added. Supported files: PDF, Word (.docx), text (.txt) and Markdown (.md)."
)
# Single-byte code pages for Latin-script languages, as charset_normalizer names them
LATIN_ENCODINGS = {
    "cp1250", "cp1252", "cp1257", "latin_1", "mac_latin2", "mac_roman", "mac_iceland",
    "iso8859_2", "iso8859_3", "iso8859_4", "iso8859_9", "iso8859_10", "iso8859_13",
    "iso8859_14", "iso8859_15", "iso8859_16",
}  # fmt: skip


def _is_textual(content_type: str) -> bool:
    # No Content-Type at all is treated as a web page, as browsers do
    return (
        not content_type
        or content_type.startswith("text/")
        or any(kind in content_type for kind in ("html", "xml", "json"))
    )


def decode_text(data: bytes) -> str:
    """Decodes a text file of unknown encoding."""
    try:
        # Most files are UTF-8, and valid UTF-8 is almost never another encoding by chance
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    matches = charset_normalizer.from_bytes(data)
    best = matches.best()
    if best is None:
        return data.decode("utf-8", errors="replace")
    # On short Western text the Latin code pages nearly tie, and the detector often ranks Windows-1250 or a
    # Mac code page above Windows-1252, turning "naïve" into "naďve". Windows-1252 is by far the commonest
    # legacy encoding, so it wins among Latin candidates. Cyrillic, Greek or Polish text doesn't list it.
    if best.encoding in LATIN_ENCODINGS and any(m.encoding == "cp1252" for m in matches):
        return data.decode("cp1252", errors="replace")
    return str(best)


def _filename(url: str) -> str:
    return unquote(PurePosixPath(urlparse(url).path).name)


async def _extract_office(body: bytes, content_type: str, name: str) -> dict | None:
    """PDF or Word content, an error for a broken or legacy one, or None when it's neither."""
    suffix = PurePosixPath(name.lower()).suffix
    if looks_like_pdf(body):
        result = await PdfExtractor().extract(body)
        result["metadata"]["format"] = "pdf"
        return result
    if looks_like_docx(body):
        result = await DocxExtractor().extract(body)
        result["metadata"]["format"] = "docx"
        return result

    if looks_like_legacy_office(body) or content_type == "application/msword" or suffix == ".doc":
        raise UnsupportedFormatError(LEGACY_DOC_ERROR)
    if content_type == PDF_MIME or suffix == ".pdf":
        raise ExtractionError("The file is labelled as a PDF, but it isn't a valid PDF.")
    if content_type == DOCX_MIME or suffix == ".docx":
        raise ExtractionError("The file is labelled as a Word file, but it isn't a valid .docx.")
    return None


def _with_title(result: dict, fallback: str) -> dict:
    # PDFs and Word files often carry no title; the file name beats "Untitled Source"
    if not result["metadata"].get("title"):
        result["metadata"]["title"] = fallback
    return result


async def extract_url(url: str) -> dict:
    fetched = await fetch_url(url)
    name = _filename(fetched.url)

    # No file name here: a .pdf link that serves an HTML viewer page is read as that page
    result = await _extract_office(fetched.body, fetched.content_type, name="")
    if result is None:
        if not _is_textual(fetched.content_type):
            raise UnsupportedFormatError(
                f"This link is a file of type {fetched.content_type}, which can't be added. "
                "Supported: web pages, PDF and Word (.docx)."
            )
        result = WebExtractor.parse(fetched.body, url=url, charset=fetched.charset)
        result["metadata"]["format"] = "html"

    result["metadata"]["url"] = url
    return _with_title(result, name)


async def extract_upload(data: bytes, filename: str, content_type: str = "") -> dict:
    """Extracts an uploaded file. Only PDF, Word (.docx), text (.txt) and Markdown (.md) are accepted."""
    content_type = content_type.split(";")[0].strip().lower()
    suffix = PurePosixPath(filename.lower()).suffix
    stem = PurePosixPath(filename).stem or filename

    result = await _extract_office(data, content_type, name=filename)
    if result is None:
        if suffix not in TEXT_EXTENSIONS:
            raise UnsupportedFormatError(UNSUPPORTED_UPLOAD.format(name=filename))
        result = {
            "text": decode_text(data).strip(),
            "metadata": {"extractor": "PlainText", "format": TEXT_EXTENSIONS[suffix]},
        }

    if not result["text"].strip():
        raise ExtractionError(f"{filename} has no text to index.")
    result["metadata"]["filename"] = filename
    return _with_title(result, stem)
