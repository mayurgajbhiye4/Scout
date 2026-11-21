"""
URL extraction: PDF and Word files get their own extractors, decided from the downloaded bytes.
Tests:
- PDF and .docx links are parsed as documents, even without a file extension or a correct Content-Type
- Unreadable files (scanned PDF, password, legacy .doc, images, oversize) fail with a reason the user sees
- Web pages still go through the HTML parser
- ingest_source records that reason and corrects the source type to the format found
"""

import io
import uuid
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from docx import Document
from pypdf import PdfWriter

from app.core.exceptions import AppException
from app.db.models.source import Source, SourceStatus, SourceType
from app.services import source_service
from app.services.extractors import ExtractionError, extract_url
from app.services.extractors.fetch import fetch_url

OCTET = "application/octet-stream"
PDF = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _pdf_with_text(text: str) -> bytes:
    """A minimal one-page PDF whose text layer says `text`."""
    content = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


def _blank_pdf(password: str | None = None) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    if password:
        writer.encrypt(user_password=password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _docx() -> bytes:
    document = Document()
    document.core_properties.title = "Quarterly Plan"
    document.add_heading("Goals", level=1)
    document.add_paragraph("Ship PDF ingestion.")
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "Owner", "Due"
    table.cell(1, 0).text, table.cell(1, 1).text = "Ada", "May"
    document.add_paragraph("After the table.")
    out = io.BytesIO()
    document.save(out)
    return out.getvalue()


@pytest.fixture
def serve(monkeypatch):
    """Serves `body` with `content_type` for every request made through httpx."""
    real = httpx.AsyncClient

    def install(body: bytes, content_type: str = OCTET):
        def handler(request):
            return httpx.Response(200, content=body, headers={"Content-Type": content_type})

        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
        )

    return install


async def test_a_pdf_without_extension_or_pdf_content_type_is_read_as_pdf(serve):
    serve(_pdf_with_text("Attention is all you need"))

    result = await extract_url("https://public.example/pdf/1706.03762")

    assert result["metadata"]["format"] == "pdf"
    assert result["metadata"]["page_count"] == 1
    assert "Attention is all you need" in result["text"]
    # No title in the PDF, so the file name stands in
    assert result["metadata"]["title"] == "1706.03762"


async def test_a_docx_keeps_paragraphs_and_tables_in_order(serve):
    serve(_docx(), DOCX_MIME)

    result = await extract_url("https://public.example/plan.docx")

    assert result["metadata"]["format"] == "docx"
    assert result["metadata"]["title"] == "Quarterly Plan"
    assert result["text"].splitlines() == [
        "Goals",
        "Ship PDF ingestion.",
        "Owner | Due",
        "Ada | May",
        "After the table.",
    ]


async def test_web_pages_still_use_the_html_parser(serve):
    serve(b"<title>Docs</title><script>x()</script><p>Body</p>", "text/html; charset=utf-8")

    result = await extract_url("https://public.example/docs")

    assert result["metadata"]["format"] == "html"
    assert result["metadata"]["title"] == "Docs"
    assert result["text"] == "Docs\nBody"


@pytest.mark.parametrize(
    ("body", "content_type", "reason"),
    [
        (_blank_pdf(), OCTET, "no selectable text"),
        (_blank_pdf(password="secret"), "application/pdf", "password-protected"),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 64, OCTET, "Older Word (.doc)"),
        (b"<html>not really</html>", "application/pdf", "isn't a valid PDF"),
        (b"PK\x03\x04broken zip", DOCX_MIME, "isn't a valid .docx"),
        (b"\x89PNG\r\n\x1a\n", "image/png", "of type image/png"),
    ],
)
async def test_unreadable_files_fail_with_a_reason(serve, body, content_type, reason):
    serve(body, content_type)

    with pytest.raises(ExtractionError, match=reason.replace("(", r"\(").replace(")", r"\)")):
        await extract_url("https://public.example/file")


async def test_downloads_over_the_size_limit_are_refused(serve):
    serve(b"x" * 2048, "text/plain")

    with pytest.raises(ExtractionError, match="larger than"):
        await fetch_url("https://public.example/big", max_bytes=1024)


def _url_source(source_type=SourceType.website):
    return Source(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_type=source_type,
        title=None,
        canonical_uri="https://public.example/paper",
        status=SourceStatus.pending,
        metadata_={},
    )


def _db():
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


async def test_ingest_records_why_a_document_could_not_be_read(serve):
    serve(_blank_pdf(), "application/pdf")
    source = _url_source()

    await source_service.ingest_source(_db(), source)

    assert source.status == SourceStatus.failed
    assert "no selectable text" in source.metadata_["error"]


async def test_ingest_corrects_the_source_type_to_the_format_found(serve, monkeypatch):
    serve(_pdf_with_text("Scaling laws"))
    monkeypatch.setattr(source_service, "chunk_text", MagicMock(return_value=[]))
    # Stop right after extraction: the rest of the pipeline is covered elsewhere
    monkeypatch.setattr(
        source_service, "generate_embeddings", AsyncMock(side_effect=RuntimeError("stop"))
    )
    source = _url_source(SourceType.website)

    with pytest.raises(RuntimeError, match="stop"):
        await source_service.ingest_source(_db(), source)

    assert source.source_type == SourceType.pdf
    assert source.content_text == "Scaling laws"
    assert source.title == "paper"


# ── Uploaded files ──────────────────────────────────────────────────────────


async def test_an_uploaded_pdf_is_read_whatever_its_name_or_type():
    result = await source_service.extract_upload(_pdf_with_text("Uploaded paper"), "scan", OCTET)

    assert result["metadata"]["format"] == "pdf"
    assert result["metadata"]["title"] == "scan"
    assert "Uploaded paper" in result["text"]


async def test_an_uploaded_markdown_file_keeps_its_markup():
    text = b"# Notes\n\nUse <b>bold</b> sparingly."

    result = await source_service.extract_upload(text, "notes.md", "")

    assert result["metadata"]["format"] == "markdown"
    assert result["text"] == "# Notes\n\nUse <b>bold</b> sparingly."
    assert result["metadata"]["title"] == "notes"


@pytest.mark.parametrize(
    ("body", "filename", "content_type", "error"),
    [
        (b"\x89PNG\r\n\x1a\n", "photo.png", "image/png", "UNSUPPORTED_FILE_TYPE"),
        # Only .txt and .md text: other text formats are refused even though they are text/*
        (b"a,b\n1,2", "table.csv", "text/csv", "UNSUPPORTED_FILE_TYPE"),
        (b'{"a": 1}', "data.json", "application/json", "UNSUPPORTED_FILE_TYPE"),
        (b"<p>Hi</p>", "page.html", "text/html", "UNSUPPORTED_FILE_TYPE"),
        (b"log line", "server.log", "text/plain", "UNSUPPORTED_FILE_TYPE"),
        (
            b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 64,
            "old.doc",
            OCTET,
            "UNSUPPORTED_FILE_TYPE",
        ),
        (_blank_pdf(), "scan.pdf", "application/pdf", "VALIDATION_ERROR"),
        (b"not a pdf", "fake.pdf", "application/pdf", "VALIDATION_ERROR"),
        (b"   ", "empty.txt", "text/plain", "VALIDATION_ERROR"),
    ],
)
async def test_unreadable_uploads_are_refused_and_nothing_is_saved(
    body, filename, content_type, error
):
    db = _db()
    db.add = MagicMock()

    with pytest.raises(AppException) as raised:
        await source_service.create_uploaded_source(
            db, data=body, filename=filename, content_type=content_type, user_id=uuid.uuid4()
        )

    assert raised.value.code == error
    db.add.assert_not_called()


def _upload_db(existing=None):
    db = _db()
    db.add = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = existing
    db.execute = AsyncMock(return_value=result)
    return db


async def test_an_upload_is_saved_with_its_text_and_file_details(monkeypatch):
    ingest = AsyncMock(side_effect=lambda db, source: source)
    monkeypatch.setattr(source_service, "run_ingestion", ingest)
    db = _upload_db()

    source = await source_service.create_uploaded_source(
        db,
        data=_docx(),
        filename="plan.docx",
        content_type=DOCX_MIME,
        user_id=uuid.uuid4(),
    )

    db.add.assert_called_once_with(source)
    ingest.assert_awaited_once()
    assert source.source_type == SourceType.docx
    assert source.title == "Quarterly Plan"
    assert source.canonical_uri is None
    assert source.mime_type == DOCX_MIME
    assert "Ship PDF ingestion." in source.content_text
    assert source.metadata_["filename"] == "plan.docx"
    assert source.metadata_["size_bytes"] > 0


async def test_uploading_the_same_file_again_reuses_the_earlier_source(monkeypatch):
    earlier = _url_source(SourceType.pdf)
    reuse = AsyncMock(return_value=earlier)
    monkeypatch.setattr(source_service, "_reuse_existing", reuse)
    db = _upload_db(existing=earlier)

    source = await source_service.create_uploaded_source(
        db, data=_pdf_with_text("Same"), filename="a.pdf", content_type=PDF, user_id=uuid.uuid4()
    )

    assert source is earlier
    reuse.assert_awaited_once_with(db, earlier)
    db.add.assert_not_called()


async def test_an_uploaded_text_file_in_a_windows_encoding_is_decoded():
    text = "Café résumé: naïve façade, déjà vu. Ünïcödé text saved by Notepad in Windows-1252."
    result = await source_service.extract_upload(text.encode("cp1252"), "notes.txt", "text/plain")

    assert result["text"] == text
    assert result["metadata"]["format"] == "txt"


@pytest.mark.parametrize(
    ("text", "encoding"),
    [
        ("Привет, это заметки о поиске и ранжировании документов.", "cp1251"),
        ("Zażółć gęślą jaźń, czyli polskie znaki w pliku tekstowym.", "cp1250"),
        ("Plain UTF-8 with an emoji 🙂 and accents: café.", "utf-8"),
    ],
)
async def test_other_text_encodings_are_still_detected(text, encoding):
    result = await source_service.extract_upload(text.encode(encoding), "notes.txt", "text/plain")

    assert result["text"] == text
