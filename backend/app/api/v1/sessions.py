"""Sessions API router."""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.uploads import read_upload
from app.core.rate_limit import (
    rate_limit_sessions_create,
    rate_limit_sessions_delete,
    rate_limit_sessions_read,
    rate_limit_sessions_update,
    rate_limit_sources_delete,
    rate_limit_sources_ingest,
    rate_limit_sources_read,
)
from app.db.models.user import User
from app.schemas.pagination import PageLimit, PageSkip
from app.schemas.sessions import SessionCreate, SessionRead, SessionUpdate
from app.schemas.sources import SourceCreate, SourceRead
from app.services.session_service import (
    add_source_to_session,
    create_session,
    delete_session,
    get_session,
    get_session_source_ids,
    get_session_sources,
    get_user_sessions,
    remove_source_from_session,
    update_session,
)
from app.services.source_service import create_uploaded_source

router = APIRouter()


@router.get("/", response_model=list[SessionRead], dependencies=[Depends(rate_limit_sessions_read)])
async def read_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: PageSkip = 0,
    limit: PageLimit = 20,
):
    """One page of the current user's research sessions, most recently active first."""
    return await get_user_sessions(db, current_user.id, skip=skip, limit=limit)


@router.post(
    "/",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_sessions_create)],
)
async def create_new_session(
    *,
    db: AsyncSession = Depends(get_db),
    session_in: SessionCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new research session."""
    return await create_session(db=db, session_in=session_in, user_id=current_user.id)


@router.get(
    "/{session_id}", response_model=SessionRead, dependencies=[Depends(rate_limit_sessions_read)]
)
async def read_session(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Get a specific session by id."""
    session = await get_session(db, session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch(
    "/{session_id}", response_model=SessionRead, dependencies=[Depends(rate_limit_sessions_update)]
)
async def update_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    session_in: SessionUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update a specific session title, status, or summary."""
    session = await update_session(
        db, session_id=session_id, session_in=session_in, user_id=current_user.id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_sessions_delete)],
)
async def delete_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Delete a specific research session."""
    success = await delete_session(db, session_id=session_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return None


@router.get(
    "/{session_id}/sources",
    response_model=list[SourceRead],
    dependencies=[Depends(rate_limit_sources_read)],
)
async def read_session_sources_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    skip: PageSkip = 0,
    limit: PageLimit = 20,
):
    """One page of the sources attached to a session, most recently added first."""
    sources = await get_session_sources(
        db, session_id=session_id, user_id=current_user.id, skip=skip, limit=limit
    )
    if sources is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return sources


@router.get(
    "/{session_id}/source-ids",
    response_model=list[uuid.UUID],
    dependencies=[Depends(rate_limit_sources_read)],
)
async def read_session_source_ids_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Every source id in a session, without the sources, for scoping the map and counting."""
    ids = await get_session_source_ids(db, session_id=session_id, user_id=current_user.id)
    if ids is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return ids


@router.post(
    "/{session_id}/sources",
    response_model=SourceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_sources_ingest)],
)
async def attach_source_to_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    source_in: SourceCreate,
    current_user: User = Depends(get_current_user),
):
    """Attach a source to a session, creating/ingesting it if needed."""
    from app.services.source_service import create_source

    src = await create_source(db=db, source_in=source_in, user_id=current_user.id)
    await add_source_to_session(
        db, session_id=session_id, source_id=src.id, user_id=current_user.id
    )
    return src


@router.post(
    "/{session_id}/sources/upload",
    response_model=SourceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_sources_ingest)],
)
async def upload_source_to_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    file: UploadFile = File(..., description="PDF, Word (.docx), text or Markdown file"),
    title: str | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create a source from an uploaded file, ingest it, and attach it to the session."""
    # Checked first, so a large file isn't parsed and embedded for a session that doesn't exist
    if not await get_session(db, session_id=session_id, user_id=current_user.id):
        raise HTTPException(status_code=404, detail="Session not found")

    src = await create_uploaded_source(
        db,
        data=await read_upload(file),
        filename=file.filename or "upload",
        content_type=file.content_type or "",
        title=title,
        user_id=current_user.id,
    )
    await add_source_to_session(
        db, session_id=session_id, source_id=src.id, user_id=current_user.id
    )
    return src


@router.delete(
    "/{session_id}/sources/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_sources_delete)],
)
async def detach_source_from_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Detach a source from a session."""
    success = await remove_source_from_session(
        db, session_id=session_id, source_id=source_id, user_id=current_user.id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Session or source link not found")
    return None
