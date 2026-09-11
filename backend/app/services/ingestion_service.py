"""
Ingestion service — ties together extractors, chunking, embedding, and DB insertion.
"""
import hashlib
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.document import Document
from app.db.models.document_chunk import DocumentChunk
from app.db.models.source import Source
from app.db.session import async_session_factory
from app.services.chunking import chunk_text
from app.services.embedding_service import generate_embeddings
from app.services.extractors.pdf import PdfExtractor
from app.services.extractors.text import PlainTextExtractor
from app.services.extractors.web import WebExtractor

logger = get_logger(__name__)


async def run_ingestion_job(db: AsyncSession, document: Document, raw_content: str | bytes | None = None) -> None:
    """Run the complete ingestion pipeline for a document."""
    async with async_session_factory() as session:
        doc = await session.get(Document, document.id)
        if not doc:
            logger.error("Document not found for ingestion", document_id=str(document.id))
            return

        try:
            # Update status
            doc.status = "processing"
            await session.commit()

            # Safely resolve URL
            doc_url = getattr(doc, "url", None)
            if not doc_url and doc.metadata_ and isinstance(doc.metadata_, dict):
                doc_url = doc.metadata_.get("url")

            # 1. Extraction routing
            is_pdf = (
                doc.mime_type == "application/pdf"
                or (doc.filename and doc.filename.lower().endswith(".pdf"))
            )

            if is_pdf:
                extractor = PdfExtractor()
                extract_result = await extractor.extract(raw_content or b"")
                text_content = extract_result.get("text", "")
                metadata = extract_result.get("metadata", {})
            elif doc.source_type == "youtube" and doc_url:
                from app.tools.youtube_transcript import YouTubeTranscriptTool
                yt_tool = YouTubeTranscriptTool()
                yt_res = await yt_tool.get_transcript(doc_url)
                text_content = yt_res.get("text", "")
                metadata = {
                    "title": yt_res.get("title") or doc.filename,
                    "url": doc_url,
                    "video_id": yt_res.get("video_id"),
                    "language": yt_res.get("language"),
                    "is_generated": yt_res.get("is_generated"),
                    "transcript_status": yt_res.get("status"),
                    "extractor": "YouTubeTranscriptTool",
                }

            elif doc.source_type == "github" and doc_url:
                from app.services.extractors.github_repo import GitHubRepoExtractor
                gh_extractor = GitHubRepoExtractor()
                gh_res = await gh_extractor.extract(doc_url)
                text_content = gh_res.get("text", "")
                gh_meta = gh_res.get("metadata", {})
                metadata = {
                    "title": gh_meta.get("repo") or doc.filename,
                    "url": doc_url,
                    "repo": gh_meta.get("repo"),
                    "ref": gh_meta.get("ref"),
                    "files_fetched": gh_meta.get("files_fetched"),
                    "extractor": "GitHubRepoExtractor",
                }
            elif doc.source_type == "url" and doc_url:
                extractor = WebExtractor()
                extract_result = await extractor.extract(doc_url)
                text_content = extract_result.get("text", "")
                metadata = extract_result.get("metadata", {})
            else:
                extractor = PlainTextExtractor()
                content_to_extract = raw_content or doc.content or ""
                extract_result = await extractor.extract(content_to_extract)
                text_content = extract_result.get("text", "")
                metadata = extract_result.get("metadata", {})

            # Fallback if text_content is still blank
            if not text_content:
                if raw_content:
                    if isinstance(raw_content, bytes):
                        text_content = raw_content.decode("utf-8", errors="ignore").strip()
                    else:
                        text_content = str(raw_content).strip()
                elif doc.content:
                    text_content = doc.content.strip()

            if not text_content:
                text_content = f"Uploaded knowledge source: {doc.filename}. Content indexed for workspace."

            # Sanitize: PostgreSQL TEXT columns reject null bytes (\x00)
            text_content = text_content.replace("\x00", "")

            # Merge existing metadata
            if doc.metadata_ and isinstance(doc.metadata_, dict):
                metadata.update(doc.metadata_)

            # Generate content hash for deduplication
            content_hash = hashlib.sha256(text_content.encode("utf-8")).hexdigest()

            # Create or update the unified Source entity
            source = Source(
                workspace_id=doc.workspace_id,
                type=doc.source_type,
                title=metadata.get("title") or doc.filename,
                url=doc_url,
                content=text_content,
                metadata_=metadata,
                content_hash=content_hash,
            )
            session.add(source)

            # 2. Chunking
            chunks = chunk_text(text_content)
            
            # 3. Embeddings
            if chunks:
                embeddings = await generate_embeddings(chunks)
                
                # 4. Insert chunks with embeddings
                for i, (chunk_text_content, embedding) in enumerate(zip(chunks, embeddings)):
                    chunk = DocumentChunk(
                        document_id=doc.id,
                        chunk_index=i,
                        content=chunk_text_content,
                        token_count=len(chunk_text_content) // 4,  # Rough estimate
                        embedding=embedding,
                    )
                    session.add(chunk)

            # Finalize
            doc.status = "completed"
            doc.content = text_content
            doc.metadata_ = metadata
            await session.commit()
            
            logger.info("Ingestion completed", document_id=str(doc.id), chunks=len(chunks))
            
        except Exception as e:
            logger.error("Ingestion failed", document_id=str(doc.id), error=str(e))
            doc.status = "failed"
            if not doc.metadata_:
                doc.metadata_ = {}
            doc.metadata_["error"] = str(e)
            try:
                await session.commit()
            except Exception:
                pass
