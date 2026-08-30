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
from app.services.chunking import chunk_text
from app.services.embedding_service import generate_embeddings
from app.services.extractors.text import PlainTextExtractor
from app.services.extractors.web import WebExtractor

logger = get_logger(__name__)


async def run_ingestion_job(db: AsyncSession, document: Document, raw_content: str | bytes | None = None) -> None:
    """Run the complete ingestion pipeline for a document."""
    try:
        # Update status
        document.status = "processing"
        await db.commit()

        # 1. Extraction
        if document.source_type == "url":
            extractor = WebExtractor()
            extract_result = await extractor.extract(document.url)
        else:
            extractor = PlainTextExtractor()
            extract_result = await extractor.extract(raw_content or "")

        text_content = extract_result["text"]
        metadata = extract_result["metadata"]
        
        # Merge existing metadata
        if document.metadata_:
            metadata.update(document.metadata_)

        # Generate content hash for deduplication
        content_hash = hashlib.sha256(text_content.encode("utf-8")).hexdigest()

        # Create or update the unified Source entity
        source = Source(
            workspace_id=document.workspace_id,
            type=document.source_type,
            title=metadata.get("title") or document.filename,
            url=document.url,
            content=text_content,
            metadata_=metadata,
            content_hash=content_hash,
        )
        db.add(source)

        # 2. Chunking
        chunks = chunk_text(text_content)
        
        # 3. Embeddings
        if chunks:
            embeddings = await generate_embeddings(chunks)
            
            # 4. Insert chunks with embeddings
            for i, (chunk_text_content, embedding) in enumerate(zip(chunks, embeddings)):
                chunk = DocumentChunk(
                    document_id=document.id,
                    chunk_index=i,
                    content=chunk_text_content,
                    token_count=len(chunk_text_content) // 4,  # Rough estimate
                    embedding=embedding,
                )
                db.add(chunk)

        # Finalize
        document.status = "completed"
        document.content = text_content
        document.metadata_ = metadata
        await db.commit()
        
        logger.info("Ingestion completed", document_id=str(document.id), chunks=len(chunks))
        
    except Exception as e:
        logger.error("Ingestion failed", document_id=str(document.id), error=str(e))
        document.status = "failed"
        if not document.metadata_:
            document.metadata_ = {}
        document.metadata_["error"] = str(e)
        await db.commit()
