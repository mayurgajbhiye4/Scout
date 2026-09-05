"""PDF Extractor — extracts text and metadata from PDF files using PyMuPDF (fitz) or fallbacks."""

import io
import re
from app.core.logging import get_logger
from .base import BaseExtractor

logger = get_logger(__name__)


class PdfExtractor(BaseExtractor):
    """Extract text and metadata from PDF bytes or paths."""

    async def extract(self, source: str | bytes) -> dict:
        text_pages = []
        page_count = 1
        meta_title = ""
        meta_author = ""
        extractor_used = "PdfExtractor(fallback)"

        if not source:
            return {
                "text": "",
                "metadata": {
                    "page_count": 0,
                    "title": "Empty PDF",
                    "extractor": "PdfExtractor",
                },
            }

        # 1. Try PyMuPDF (fitz)
        try:
            import fitz  # PyMuPDF
            if isinstance(source, str):
                doc = fitz.open(source)
            elif isinstance(source, bytes):
                doc = fitz.open(stream=source, filetype="pdf")
            else:
                raise ValueError("Unsupported source type for PDF extraction")

            page_count = len(doc)
            for page_num in range(page_count):
                page = doc[page_num]
                page_text = page.get_text()
                if page_text and page_text.strip():
                    text_pages.append(page_text.strip())

            if doc.metadata:
                meta_title = doc.metadata.get("title") or ""
                meta_author = doc.metadata.get("author") or ""
            doc.close()
            extractor_used = "PyMuPDF"
        except ImportError:
            logger.info("PyMuPDF (fitz) not found, trying pypdf fallback")
            # 2. Try pypdf fallback
            try:
                import pypdf
                pdf_file = io.BytesIO(source) if isinstance(source, bytes) else open(source, "rb")
                reader = pypdf.PdfReader(pdf_file)
                page_count = len(reader.pages)
                for page in reader.pages:
                    t = page.extract_text()
                    if t and t.strip():
                        text_pages.append(t.strip())
                if reader.metadata:
                    meta_title = getattr(reader.metadata, "title", "") or ""
                    meta_author = getattr(reader.metadata, "author", "") or ""
                if isinstance(source, str):
                    pdf_file.close()
                extractor_used = "pypdf"
            except Exception as e2:
                logger.warning("pypdf extraction failed or not installed", error=str(e2))
                extractor_used = "text-stream-fallback"
        except Exception as e:
            logger.warning("PyMuPDF extraction failed", error=str(e))
            extractor_used = "text-stream-fallback"

        # 3. If text_pages is empty, try raw stream regex or basic decode
        if not text_pages:
            if isinstance(source, bytes):
                # Search for raw text streams in PDF (parentheses in text blocks)
                raw_matches = re.findall(rb"\(([\x20-\x7E]{4,})\)", source)
                if raw_matches:
                    extracted = " ".join(m.decode("latin1", errors="ignore") for m in raw_matches)
                    if len(extracted.strip()) > 30:
                        text_pages.append(extracted.strip())

            if not text_pages:
                if isinstance(source, bytes):
                    decoded = source.decode("utf-8", errors="ignore").strip()
                    if decoded:
                        text_pages.append(decoded)
                else:
                    text_pages.append(str(source))

        full_text = "\n\n".join(text_pages).strip()

        return {
            "text": full_text,
            "metadata": {
                "page_count": page_count,
                "title": meta_title or "PDF Document",
                "author": meta_author,
                "extractor": extractor_used,
            },
        }
