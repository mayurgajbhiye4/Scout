"""Source service — CRUD operations and end-to-end ingestion pipeline into source_chunks."""
import uuid
import hashlib
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.logging import get_logger
from app.db.models.source import Source, SourceType, SourceStatus
from app.db.models.source_chunk import SourceChunk
from app.schemas.sources import SourceCreate
from app.services.chunking import chunk_text
from app.services.embedding_service import generate_embeddings
from app.services.extractors.web import WebExtractor

logger = get_logger(__name__)


async def get_user_sources(db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 100) -> List[Source]:
    stmt = select(Source).where(Source.user_id == user_id).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def ingest_source(db: AsyncSession, source: Source) -> Source:
    """
    Runs the full ingestion pipeline for a Source:
    1. Extracts content from URL or raw text.
    2. Chunks the text.
    3. Generates 768-dim vector embeddings.
    4. Persists chunks into `source_chunks` table with embeddings.
    5. Marks source as 'indexed'.
    6. Extracts knowledge graph entities into Neo4j (non-blocking).
    """
    logger.info("Starting ingestion for source", source_id=str(source.id), url=source.canonical_uri)
    source.status = SourceStatus.processing
    await db.commit()

    extracted_text = source.content_text or ""
    extracted_title = source.title

    # 1. Extraction from URL if content not already present
    if source.canonical_uri and not extracted_text:
        url = source.canonical_uri.strip()
        try:
            if "youtube.com" in url or "youtu.be" in url:
                try:
                    from app.tools.youtube_transcript import YouTubeTranscriptTool
                    yt_tool = YouTubeTranscriptTool()
                    yt_res = await yt_tool.get_transcript(url)
                    extracted_text = yt_res.get("text", "")
                    extracted_title = yt_res.get("title") or extracted_title
                except Exception as yt_err:
                    logger.warning(f"YouTube transcript extraction failed, falling back to web: {yt_err}")

            elif "github.com" in url:
                try:
                    from app.services.extractors.github_repo import GitHubRepoExtractor
                    gh_extractor = GitHubRepoExtractor()
                    gh_res = await gh_extractor.extract(url)
                    extracted_text = gh_res.get("text", "")
                    gh_meta = gh_res.get("metadata", {})
                    extracted_title = gh_meta.get("repo") or extracted_title
                except Exception as gh_err:
                    logger.warning(f"GitHub extraction failed, falling back to web: {gh_err}")

            if not extracted_text:
                extractor = WebExtractor()
                extract_res = await extractor.extract(url)
                extracted_text = extract_res.get("text", "")
                meta = extract_res.get("metadata", {})
                if meta.get("title"):
                    extracted_title = meta["title"]

        except Exception as extract_err:
            logger.warning("Content extraction from URL failed", error=str(extract_err), url=url)

    # Clean and fallback if still empty
    # Clean and fallback check
    if not extracted_text or not extracted_text.strip() or (extracted_text.startswith("YouTube video:") and "could not be extracted" in extracted_text):
        logger.warning("Extraction returned empty or unavailable transcript", source_id=str(source.id))
        source.status = SourceStatus.failed
        source.metadata_ = {**(source.metadata_ or {}), "error": "Could not extract content/transcript from source"}
        await db.commit()
        await db.refresh(source)
        return source

    extracted_text = extracted_text.replace("\x00", "").strip()

    source.title = extracted_title or "Untitled Source"
    source.content_text = extracted_text
    source.content_hash = hashlib.sha256(extracted_text.encode("utf-8")).hexdigest()

    # 2. Chunking
    chunks = chunk_text(extracted_text, max_chunk_size=1200, overlap=150)
    if not chunks:
        chunks = [extracted_text[:2000]]

    # 3. Generate Vector Embeddings
    try:
        embeddings = await generate_embeddings(chunks)
    except Exception as emb_err:
        logger.warning(f"Error generating embeddings during ingestion: {emb_err}")
        embeddings = []

    # 4. Save Chunks into source_chunks table
    if embeddings and len(embeddings) == len(chunks):
        for i, (chunk_content, emb) in enumerate(zip(chunks, embeddings)):
            chunk_record = SourceChunk(
                source_id=source.id,
                chunk_index=i,
                content=chunk_content,
                token_count=max(1, len(chunk_content) // 4),
                metadata_={"title": source.title, "url": source.canonical_uri},
                embedding=emb,
            )
            db.add(chunk_record)

        source.status = SourceStatus.indexed
        source.last_indexed_at = datetime.now(timezone.utc)
        source.metadata_ = {**(source.metadata_ or {}), "chunk_count": len(chunks)}
        await db.commit()
        await db.refresh(source)
        logger.info("Successfully ingested source into source_chunks", source_id=str(source.id), chunk_count=len(chunks))
    else:
        logger.error("Embedding generation failed or incomplete", source_id=str(source.id))
        source.status = SourceStatus.failed
        source.metadata_ = {**(source.metadata_ or {}), "error": "Vector embedding generation failed"}
        await db.commit()
        await db.refresh(source)
        return source

    # 5. Extract into Universal Neo4j Knowledge Graph (non-blocking)
    try:
        from app.graph.engine import graph_engine
        if graph_engine and graph_engine.driver:
            graph_engine.extract_graph_from_text(
                text=extracted_text[:2500],
                source_id=str(source.id),
                source_title=source.title,
                user_id=str(source.user_id),
            )
    except Exception as graph_err:
        logger.debug(f"Non-critical graph extraction error: {graph_err}")

    return source


async def get_source(db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Source]:
    stmt = select(Source).where(Source.id == source_id, Source.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalars().first()


async def create_source(db: AsyncSession, source_in: SourceCreate, user_id: uuid.UUID) -> Source:
    """Create a new source and immediately run the ingestion pipeline."""
    # Check if this exact source URL already exists for the user
    if source_in.url:
        clean_url = source_in.url.strip()
        stmt = select(Source).where(Source.user_id == user_id, Source.canonical_uri == clean_url)
        res = await db.execute(stmt)
        existing_source = res.scalars().first()
        if existing_source:
            chunk_stmt = select(SourceChunk.id).where(SourceChunk.source_id == existing_source.id).limit(1)
            chunk_res = await db.execute(chunk_stmt)
            if existing_source.status == SourceStatus.indexed and chunk_res.first() is not None:
                from sqlalchemy import func
                cnt_stmt = select(func.count(SourceChunk.id)).where(SourceChunk.source_id == existing_source.id)
                cnt_res = await db.execute(cnt_stmt)
                cnt = cnt_res.scalar() or 1
                existing_source.metadata_ = {**(existing_source.metadata_ or {}), "chunk_count": cnt}
                logger.info("Source already indexed for user, returning existing source", source_id=str(existing_source.id))
                return existing_source
            else:
                logger.info("Source exists but not indexed/has 0 chunks. Re-running ingestion.", source_id=str(existing_source.id))
                return await ingest_source(db=db, source=existing_source)

    # Infer source type
    src_type = source_in.source_type or SourceType.website
    if source_in.url:
        u = source_in.url.lower()
        if u.endswith(".pdf"):
            src_type = SourceType.pdf
        elif "youtube.com" in u or "youtu.be" in u:
            src_type = SourceType.youtube
        elif "github.com" in u:
            src_type = SourceType.github

    source = Source(
        user_id=user_id,
        source_type=src_type,
        title=source_in.title or source_in.url or "New Source",
        canonical_uri=source_in.url,
        content_text=source_in.content,
        status=SourceStatus.pending,
        metadata_={},
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    # Ingest source into source_chunks with embeddings
    try:
        source = await ingest_source(db=db, source=source)
    except Exception as e:
        logger.error(f"Error during source ingestion: {e}")
        source.status = SourceStatus.failed
        await db.commit()
        await db.refresh(source)

    return source


async def delete_source(db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt = select(Source).where(Source.id == source_id, Source.user_id == user_id)
    result = await db.execute(stmt)
    source = result.scalars().first()
    if not source:
        return False
    await db.delete(source)
    await db.commit()
    return True
