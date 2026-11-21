"""Word extractor: paragraphs and tables of a .docx file, in document order, via python-docx."""

import asyncio
import io
import zipfile

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from .base import BaseExtractor
from .fetch import ExtractionError

ZIP_MAGIC = b"PK\x03\x04"
# Legacy binary formats (.doc, .xls, .ppt) are OLE compound files
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def looks_like_docx(body: bytes) -> bool:
    if not body.startswith(ZIP_MAGIC):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            return "word/document.xml" in archive.namelist()
    except zipfile.BadZipFile:
        return False


def looks_like_legacy_office(body: bytes) -> bool:
    return body.startswith(OLE_MAGIC)


class DocxExtractor(BaseExtractor):
    """Extract text and metadata from .docx bytes."""

    async def extract(self, source: bytes) -> dict:
        return await asyncio.to_thread(_extract_docx, source)


def _table_lines(table: Table) -> list[str]:
    lines = []
    for row in table.rows:
        cells = []
        previous = None
        for cell in row.cells:
            # A merged cell is repeated once per grid column it spans; keep it once
            if cell._tc is previous:
                continue
            previous = cell._tc
            cells.append(cell.text.strip())
        if any(cells):
            lines.append(" | ".join(cells))
    return lines


def _extract_docx(data: bytes) -> dict:
    try:
        document = Document(io.BytesIO(data))
    except Exception as err:
        raise ExtractionError("This Word file couldn't be read. The file may be damaged.") from err

    lines = []
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            text = Paragraph(child, document).text.strip()
            if text:
                lines.append(text)
        elif child.tag == qn("w:tbl"):
            lines.extend(_table_lines(Table(child, document)))

    if not lines:
        raise ExtractionError("This Word file has no text to index.")

    properties = document.core_properties
    return {
        "text": "\n".join(lines),
        "metadata": {
            "title": (properties.title or "").strip(),
            "author": (properties.author or "").strip(),
            "extractor": "DocxExtractor",
        },
    }
