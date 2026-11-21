"""Source service — CRUD operations and end-to-end ingestion pipeline into source_chunks."""

import hashlib
import uuid
from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RateLimitError, UnsupportedFileTypeError, ValidationError
from app.core.logging import get_logger
from app.db.models.source import Source, SourceStatus, SourceType
from app.db.models.source_chunk import SourceChunk
from app.schemas.sources import SourceCreate
from app.services.chunking import chunk_text
from app.services.embedding_service import EmbeddingUnavailable, generate_embeddings
from app.services.extractors import (
    ExtractionError,
    UnsupportedFormatError,
    extract_upload,
    extract_url,
)
from app.services.source_lifecycle import (
    ABANDONED_INGEST_ERROR,
    IN_FLIGHT,
    is_ingest_running,
    lease_cutoff,
    transition_source,
)
from app.utils.text_security import UnsafeURLError, ensure_public_url

logger = get_logger(__name__)

EMBEDDING_UNAVAILABLE_ERROR = (
    "Ingestion failed: the embedding model is unavailable. Try again in a moment."
)


def _embedding_failure_message(err: Exception) -> str:
    if isinstance(err, RateLimitError):
        return f"Ingestion failed: too many passages are being indexed. Try again in {err.retry_after or 60} seconds."
    return EMBEDDING_UNAVAILABLE_ERROR


async def fail_abandoned_ingests(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Fails sources a crashed request left in flight, so they stop showing (and polling) as ingesting forever."""
    stmt = select(Source).where(
        Source.user_id == user_id,
        Source.status.in_(IN_FLIGHT),
        Source.updated_at < lease_cutoff(),
    )
    abandoned = (await db.execute(stmt)).scalars().all()
    for source in abandoned:
        transition_source(source, SourceStatus.failed, error=ABANDONED_INGEST_ERROR)
    if abandoned:
        await db.commit()


# The library's filter kinds, worked out the same way as the client's getSourceKind (sourceMeta.ts), first match wins
SOURCE_KINDS = ("pdf", "youtube", "github", "web", "notes")
_NOTE_TYPES = (SourceType.markdown, SourceType.txt, SourceType.docx, SourceType.notion)


def source_kind_expr():
    """SQL for a source's library kind, so the server can filter and count by it."""
    uri = func.lower(func.coalesce(Source.canonical_uri, ""))
    title = func.lower(Source.title)
    return case(
        (
            or_(
                Source.source_type == SourceType.youtube,
                uri.contains("youtube.com"),
                uri.contains("youtu.be"),
            ),
            "youtube",
        ),
        (or_(Source.source_type == SourceType.github, uri.contains("github.com")), "github"),
        (
            or_(Source.source_type == SourceType.pdf, uri.endswith(".pdf"), title.endswith(".pdf")),
            "pdf",
        ),
        (Source.source_type.in_(_NOTE_TYPES), "notes"),
        else_="web",
    )


def _library_filters(
    user_id: uuid.UUID,
    query: str | None = None,
    kind: str | None = None,
    ids: list[uuid.UUID] | None = None,
) -> list:
    filters = [Source.user_id == user_id]
    if query and query.strip():
        q = query.strip()
        filters.append(
            or_(
                Source.title.icontains(q, autoescape=True),
                Source.canonical_uri.icontains(q, autoescape=True),
            )
        )
    if kind:
        filters.append(source_kind_expr() == kind)
    if ids is not None:
        filters.append(Source.id.in_(ids))
    return filters


async def get_user_sources(
    db: AsyncSession,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 20,
    query: str | None = None,
    kind: str | None = None,
    ids: list[uuid.UUID] | None = None,
) -> list[Source]:
    """One page of the user's library, most recently indexed first, optionally searched and filtered."""
    if skip == 0:
        await fail_abandoned_ingests(db, user_id)
    stmt = (
        select(Source)
        .where(*_library_filters(user_id, query=query, kind=kind, ids=ids))
        .order_by(
            func.coalesce(Source.last_indexed_at, Source.created_at).desc(),
            Source.created_at.desc(),
            # A unique tie-break, so rows with equal timestamps can't repeat or vanish between pages
            Source.id.desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def count_user_sources_by_kind(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """How many sources the library holds, in all and per kind, without loading any of them."""
    kind = source_kind_expr().label("kind")
    stmt = select(kind, func.count()).where(Source.user_id == user_id).group_by(kind)
    rows = (await db.execute(stmt)).all()
    by_kind = dict.fromkeys(SOURCE_KINDS, 0)
    for k, n in rows:
        by_kind[k] = int(n)
    return {"total": sum(by_kind.values()), "by_kind": by_kind}


async def _extract_from_url(source: Source) -> tuple[str, str | None, str | None]:
    """
    Fetches the source's URL content: YouTube transcript, GitHub repo, or else PDF, Word (.docx) or
    web page, decided from the downloaded file. Also corrects `source_type` to the format found.

    Returns (text, title, error). Text is "" on failure; error is a user-facing reason when there is one.
    """
    url = source.canonical_uri.strip()
    text, title = "", source.title
    try:
        if "youtube.com" in url or "youtu.be" in url:
            try:
                from app.tools.youtube_transcript import YouTubeTranscriptTool

                yt_res = await YouTubeTranscriptTool().get_transcript(url)
                text = yt_res.get("text", "")
                title = yt_res.get("title") or title
            except Exception as yt_err:
                logger.warning(
                    f"YouTube transcript extraction failed, falling back to web: {yt_err}"
                )

        elif "github.com" in url:
            try:
                from app.services.extractors.github_repo import GitHubRepoExtractor

                gh_res = await GitHubRepoExtractor().extract(url)
                text = gh_res.get("text", "")
                title = gh_res.get("metadata", {}).get("repo") or title
            except Exception as gh_err:
                logger.warning(f"GitHub extraction failed, falling back to web: {gh_err}")

        if not text:
            extract_res = await extract_url(url)
            text = extract_res.get("text", "")
            meta = extract_res.get("metadata", {})
            title = meta.get("title") or title
            detected = _FORMAT_TYPES.get(meta.get("format", ""))
            if detected and source.source_type in _DOCUMENT_TYPES:
                source.source_type = detected

    except ExtractionError as extract_err:
        logger.info("Source content can't be extracted", reason=str(extract_err), url=url)
        return "", title, str(extract_err)
    except Exception as extract_err:
        logger.warning("Content extraction from URL failed", error=str(extract_err), url=url)
        return "", title, None

    return text, title, None


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
    transition_source(source, SourceStatus.processing)
    await db.commit()

    extracted_text = source.content_text or ""
    extracted_title = source.title
    # Set when extraction fails for a reason the user can act on (scanned PDF, file too large, ...)
    extraction_error: str | None = None

    # 1. Extraction from URL if content not already present
    if source.canonical_uri and not extracted_text:
        extracted_text, extracted_title, extraction_error = await _extract_from_url(source)

    # Clean and fallback if still empty
    # Clean and fallback check
    if (
        not extracted_text
        or not extracted_text.strip()
        or (
            extracted_text.startswith("YouTube video:")
            and "could not be extracted" in extracted_text
        )
    ):
        logger.warning(
            "Extraction returned empty or unavailable transcript", source_id=str(source.id)
        )
        transition_source(
            source,
            SourceStatus.failed,
            error=extraction_error or "Could not extract content/transcript from source",
        )
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

    # 3. Generate Vector Embeddings. Without real ones nothing is saved: the source fails and can be retried.
    try:
        embeddings = await generate_embeddings(chunks)
    except (EmbeddingUnavailable, RateLimitError) as emb_err:
        logger.error(
            "Couldn't embed chunks, ingestion failed", source_id=str(source.id), error=str(emb_err)
        )
        transition_source(source, SourceStatus.failed, error=_embedding_failure_message(emb_err))
        await db.commit()
        await db.refresh(source)
        return source

    # 4. Save Chunks into source_chunks table
    for i, (chunk_content, emb) in enumerate(zip(chunks, embeddings, strict=False)):
        chunk_record = SourceChunk(
            source_id=source.id,
            chunk_index=i,
            content=chunk_content,
            token_count=max(1, len(chunk_content) // 4),
            metadata_={"title": source.title, "url": source.canonical_uri},
            embedding=emb,
        )
        db.add(chunk_record)

    transition_source(source, SourceStatus.indexed)
    source.last_indexed_at = datetime.now(UTC)
    source.metadata_ = {**(source.metadata_ or {}), "chunk_count": len(chunks)}
    await db.commit()
    await db.refresh(source)
    logger.info(
        "Successfully ingested source into source_chunks",
        source_id=str(source.id),
        chunk_count=len(chunks),
    )

    # 5. Extract into Universal Neo4j Knowledge Graph (non-blocking)
    try:
        from app.graph.engine import graph_engine
        from app.memory.store import invalidate_prompts_cache

        if graph_engine and graph_engine.driver:
            graph_engine.extract_graph_from_text(
                text=extracted_text[:2500],
                source_id=str(source.id),
                source_title=source.title,
                user_id=str(source.user_id),
            )
            invalidate_prompts_cache(str(source.user_id))
    except Exception as graph_err:
        logger.debug(f"Non-critical graph extraction error: {graph_err}")

    return source


async def run_ingestion(db: AsyncSession, source: Source) -> Source:
    """Ingests a source, and makes sure an unexpected error ends in `failed` rather than stuck in `processing`."""
    try:
        return await ingest_source(db=db, source=source)
    except Exception as e:
        logger.error(f"Error during source ingestion: {e}")
        # The failed flush poisons the transaction, and the rollback expires what the transition reads
        await db.rollback()
        await db.refresh(source)
        transition_source(
            source, SourceStatus.failed, error="Ingestion failed unexpectedly. Try again."
        )
        await db.commit()
        await db.refresh(source)
        return source


async def get_source(db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID) -> Source | None:
    stmt = select(Source).where(Source.id == source_id, Source.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalars().first()


async def _find_by_url(db: AsyncSession, user_id: uuid.UUID, url: str) -> Source | None:
    stmt = select(Source).where(Source.user_id == user_id, Source.canonical_uri == url)
    res = await db.execute(stmt)
    return res.scalars().first()


async def _reuse_existing(db: AsyncSession, existing_source: Source) -> Source:
    """Return a source the user already added for this URL, re-ingesting it only if it never finished."""
    if is_ingest_running(existing_source):
        # Starting a second run here would write every chunk twice
        logger.info(
            "Source is already being ingested, joining that run", source_id=str(existing_source.id)
        )
        return existing_source
    chunk_stmt = select(SourceChunk.id).where(SourceChunk.source_id == existing_source.id).limit(1)
    chunk_res = await db.execute(chunk_stmt)
    if existing_source.status == SourceStatus.indexed and chunk_res.first() is not None:
        cnt_stmt = select(func.count(SourceChunk.id)).where(
            SourceChunk.source_id == existing_source.id
        )
        cnt_res = await db.execute(cnt_stmt)
        cnt = cnt_res.scalar() or 1
        existing_source.metadata_ = {**(existing_source.metadata_ or {}), "chunk_count": cnt}
        logger.info(
            "Source already indexed for user, returning existing source",
            source_id=str(existing_source.id),
        )
        return existing_source
    logger.info(
        "Source exists but not indexed/has 0 chunks. Re-running ingestion.",
        source_id=str(existing_source.id),
    )
    return await run_ingestion(db, existing_source)


# The format extract_url found, as a source type. Only applied to sources labelled as one of
# _DOCUMENT_TYPES, so a YouTube or GitHub source that fell back to its web page keeps its type.
_FORMAT_TYPES = {"pdf": SourceType.pdf, "docx": SourceType.docx, "html": SourceType.website}
_DOCUMENT_TYPES = {SourceType.website, SourceType.pdf, SourceType.docx}


def _infer_type(url: str | None, given: SourceType | None) -> SourceType:
    u = (url or "").lower()
    path = urlparse(u).path
    if path.endswith(".pdf"):
        return SourceType.pdf
    if path.endswith(".docx"):
        return SourceType.docx
    if "youtube.com" in u or "youtu.be" in u:
        return SourceType.youtube
    if "github.com" in u:
        return SourceType.github
    return given or SourceType.website


async def create_source(db: AsyncSession, source_in: SourceCreate, user_id: uuid.UUID) -> Source:
    """Create a new source from a link and immediately run the ingestion pipeline."""
    clean_url = source_in.url.strip()
    # Refuse internal addresses before anything is saved; the web extractor checks again per fetch
    try:
        await ensure_public_url(clean_url)
    except UnsafeURLError as exc:
        raise ValidationError(str(exc), details={"url": clean_url}) from exc
    existing_source = await _find_by_url(db, user_id, clean_url)
    if existing_source:
        return await _reuse_existing(db, existing_source)

    source = Source(
        user_id=user_id,
        source_type=_infer_type(clean_url, source_in.source_type),
        title=source_in.title or clean_url,
        canonical_uri=clean_url,
        status=SourceStatus.pending,
        metadata_={},
    )
    db.add(source)
    try:
        await db.commit()
    except IntegrityError:
        # A simultaneous add of the same URL inserted first (uq_sources_user_canonical_uri)
        await db.rollback()
        existing_source = await _find_by_url(db, user_id, clean_url)
        if existing_source is None:
            raise
        logger.info(
            "Lost a race to add this URL, using the other request's source",
            source_id=str(existing_source.id),
        )
        return await _reuse_existing(db, existing_source)
    await db.refresh(source)

    # Ingest source into source_chunks with embeddings
    return await run_ingestion(db, source)


_UPLOAD_TYPES = {
    "pdf": SourceType.pdf,
    "docx": SourceType.docx,
    "markdown": SourceType.markdown,
    "txt": SourceType.txt,
}


async def create_uploaded_source(
    db: AsyncSession,
    *,
    data: bytes,
    filename: str,
    content_type: str,
    user_id: uuid.UUID,
    title: str | None = None,
) -> Source:
    """
    Creates a source from an uploaded file (PDF, Word .docx, text or Markdown) and ingests it.

    The text is extracted before anything is saved: a file that can't be read raises
    UnsupportedFileTypeError (415) or ValidationError (422) with the reason, and leaves no row behind.
    Uploading a file whose text the user already has returns that source instead of a duplicate.
    """
    try:
        extracted = await extract_upload(data, filename, content_type)
    except UnsupportedFormatError as exc:
        raise UnsupportedFileTypeError(content_type or filename, str(exc)) from exc
    except ExtractionError as exc:
        raise ValidationError(str(exc), details={"filename": filename}) from exc

    text = extracted["text"].replace("\x00", "").strip()
    meta = extracted["metadata"]

    # Same hash ingest_source stores, so an identical upload finds the earlier source
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    existing = await db.execute(
        select(Source).where(
            Source.user_id == user_id,
            Source.canonical_uri.is_(None),
            Source.content_hash == content_hash,
        )
    )
    existing_source = existing.scalars().first()
    if existing_source:
        return await _reuse_existing(db, existing_source)

    source = Source(
        user_id=user_id,
        source_type=_UPLOAD_TYPES.get(meta.get("format", ""), SourceType.txt),
        title=(title or meta.get("title") or filename)[:512],
        canonical_uri=None,
        mime_type=content_type[:100] or None,
        content_text=text,
        status=SourceStatus.pending,
        metadata_={
            "filename": filename,
            "size_bytes": len(data),
            **({"page_count": meta["page_count"]} if "page_count" in meta else {}),
            **({"author": meta["author"]} if meta.get("author") else {}),
        },
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return await run_ingestion(db, source)


async def delete_source(db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt = select(Source).where(Source.id == source_id, Source.user_id == user_id)
    result = await db.execute(stmt)
    source = result.scalars().first()
    if not source:
        return False
    await db.delete(source)
    await db.commit()
    return True
