"""
Retrieval service — handles vector search, deduplication, and context packing.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.source import Source
from app.db.models.source_chunk import SourceChunk
from app.schemas.retrieval import ContextChunk, RetrievalResult
from app.services.embedding_service import generate_embeddings
from app.retrieval.reranker import reranker
from app.graph.engine import graph_engine

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
            select(SourceChunk, Source)
            .join(Source, SourceChunk.source_id == Source.id)
            .where(Source.user_id == workspace_id)
            .where(Source.status == "indexed")
            .order_by(SourceChunk.embedding.cosine_distance(query_vector))
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
                        source_type=doc.source_type.value,
                        title=doc.title,
                        content=chunk.content,
                        score=0.9, # Placeholder, in prod extract from DB result
                        metadata_=doc.metadata_
                    )
                )
                
                if len(context_chunks) >= top_k * 2:  # Fetch more for reranking
                    break

        # 3.5. Perform Graph Search (Hybrid)
        graph_entities = graph_engine.get_related_entities(query=query, user_id=str(workspace_id), limit=top_k)
        for entity in graph_entities:
            # Add graph nodes as synthetic context chunks
            content = f"Entity: {entity.get('label', '')} ({entity.get('type', '')}) - Related to user query context."
            context_chunks.append(
                ContextChunk(
                    document_id=entity.get("id", "graph_node"),
                    source_type="graph",
                    title=f"Graph Node: {entity.get('label', '')}",
                    content=content,
                    score=0.5,
                    metadata_={"type": entity.get("type")}
                )
            )

        # 3.6. Semantic Reranking
        docs_for_reranking = [chunk.model_dump() for chunk in context_chunks]
        reranked_docs = reranker.rerank(query, docs_for_reranking, top_k=top_k)
        
        # Convert back to ContextChunk
        reranked_chunks = [
            ContextChunk(
                document_id=doc["document_id"],
                source_type=doc["source_type"],
                title=doc["title"],
                content=doc["content"],
                score=doc.get("rerank_score", doc["score"]),
                metadata_=doc["metadata_"]
            )
            for doc in reranked_docs
        ]

        # 4. Context Packing
        packed_text = ""
        total_tokens = 0
        
        for i, ctx in enumerate(reranked_chunks):
            # Estimate tokens: 1 token ~ 4 chars
            chunk_tokens = len(ctx.content) // 4
            
            if total_tokens + chunk_tokens > max_tokens:
                logger.info("Context packed to max tokens", tokens=total_tokens)
                break
                
            packed_text += f"\n\n--- Source [{i+1}]: {ctx.title} ({ctx.source_type}) ---\n"
            packed_text += ctx.content
            total_tokens += chunk_tokens

        return RetrievalResult(
            chunks=reranked_chunks[:len(packed_text.split("--- Source")) - 1], # Match packed count
            packed_context=packed_text.strip(),
            total_tokens=total_tokens
        )
