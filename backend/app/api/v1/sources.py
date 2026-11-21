"""Sources API router."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.uploads import read_upload
from app.core.rate_limit import (
    rate_limit_sources_delete,
    rate_limit_sources_ingest,
    rate_limit_sources_read,
)
from app.db.models.user import User
from app.schemas.pagination import PageLimit, PageSkip
from app.schemas.sources import SourceCounts, SourceCreate, SourceRead
from app.services.source_service import (
    count_user_sources_by_kind,
    create_source,
    create_uploaded_source,
    delete_source,
    get_source,
    get_user_sources,
)

router = APIRouter()


@router.get("/", response_model=list[SourceRead], dependencies=[Depends(rate_limit_sources_read)])
async def read_sources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: PageSkip = 0,
    limit: PageLimit = 20,
    q: str | None = Query(None, max_length=200, description="Matches the title or URL"),
    kind: Literal["pdf", "youtube", "github", "web", "notes"] | None = None,
    ids: list[uuid.UUID] | None = Query(
        None, max_length=200, description="Only these sources, e.g. the ones that mention a concept"
    ),
):
    """One page of the current user's sources, most recently indexed first."""
    return await get_user_sources(
        db, current_user.id, skip=skip, limit=limit, query=q, kind=kind, ids=ids
    )


@router.get("/counts", response_model=SourceCounts, dependencies=[Depends(rate_limit_sources_read)])
async def read_source_counts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """How many sources the library holds, in all and per kind, for the filter chips."""
    return await count_user_sources_by_kind(db, current_user.id)


@router.get(
    "/{source_id}", response_model=SourceRead, dependencies=[Depends(rate_limit_sources_read)]
)
async def read_source_by_id(
    *,
    db: AsyncSession = Depends(get_db),
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Retrieve a specific source by id."""
    source = await get_source(db, source_id=source_id, user_id=current_user.id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.post(
    "/",
    response_model=SourceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_sources_ingest)],
)
async def create_new_source(
    *,
    db: AsyncSession = Depends(get_db),
    source_in: SourceCreate,
    current_user: User = Depends(get_current_user),
):
    """Create and ingest a new source."""
    return await create_source(db=db, source_in=source_in, user_id=current_user.id)


@router.post(
    "/upload",
    response_model=SourceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_sources_ingest)],
)
async def upload_source(
    *,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(..., description="PDF, Word (.docx), text or Markdown file"),
    title: str | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create and ingest a source from an uploaded file."""
    return await create_uploaded_source(
        db,
        data=await read_upload(file),
        filename=file.filename or "upload",
        content_type=file.content_type or "",
        title=title,
        user_id=current_user.id,
    )


@router.delete(
    "/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_sources_delete)],
)
async def delete_source_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Delete a specific source."""
    success = await delete_source(db, source_id=source_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Source not found")
    return None
