"""
Retrieval service — handles vector search, deduplication, and context packing.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.document import Document
from app.db.models.document_chunk import DocumentChunk
from app.schemas.retrieval import ContextChunk, RetrievalResult
from app.services.embedding import generate_embeddings

logger = get_logger(__name__)


class RetrievalService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def search(self, workspace_id: UUID, query: str, top_k: int = 5, max_tokens: int = 8000) -> RetrievalResult:
        """
        Perform a semantic search for a given query over all documents in a workspace.
        """
        logger.info("Starting semantic search", query=query, workspace_id=str(workspace_id))
        
        # 1. Generate query embedding
        query_embeddings = await generate_embeddings([query])
        if not query_embeddings:
            return RetrievalResult(chunks=[], packed_context="", total_tokens=0)
            
        query_vector = query_embeddings[0]

        # 2. Perform vector search using pgVector's cosine distance operator
        # Using SQLAlchemy 2.0 ORM construct
        stmt = (
            select(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(Document.workspace_id == workspace_id)
            .where(Document.status == "completed")
            .order_by(DocumentChunk.embedding.cosine_distance(query_vector))
            .limit(top_k * 2)  # Fetch more to allow for deduplication
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        # 3. Deduplicate and format chunks
        unique_content_hashes = set()
        context_chunks: list[ContextChunk] = []
        
        for chunk, doc in rows:
            # Simple deduplication (e.g. overlapping chunks might be too similar)
            # A robust implementation would use a fuzzy hash or exact substring matching
            chunk_hash = hash(chunk.content)
            
            if chunk_hash not in unique_content_hashes:
                unique_content_hashes.add(chunk_hash)
                
                # We calculate cosine similarity: 1 - cosine_distance
                # Note: to get the actual distance we'd need to select it, but we can approximate or ignore it for MVP packing
                
                context_chunks.append(
                    ContextChunk(
                        document_id=str(doc.id),
                        source_type=doc.source_type,
                        title=doc.metadata_.get("title") if doc.metadata_ else doc.filename,
                        content=chunk.content,
                        score=0.9, # Placeholder, in prod extract from DB result
                        metadata_=doc.metadata_
                    )
                )
                
                if len(context_chunks) >= top_k:
                    break

        # 4. Context Packing
        packed_text = ""
        total_tokens = 0
        
        for i, ctx in enumerate(context_chunks):
            # Estimate tokens: 1 token ~ 4 chars
            chunk_tokens = len(ctx.content) // 4
            
            if total_tokens + chunk_tokens > max_tokens:
                logger.info("Context packed to max tokens", tokens=total_tokens)
                break
                
            packed_text += f"\n\n--- Source [{i+1}]: {ctx.title} ({ctx.source_type}) ---\n"
            packed_text += ctx.content
            total_tokens += chunk_tokens

        return RetrievalResult(
            chunks=context_chunks[:len(packed_text.split("--- Source")) - 1], # Match packed count
            packed_context=packed_text.strip(),
            total_tokens=total_tokens
        )
