"""Sessions API router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.api.deps import get_db, get_current_user
from app.core.rate_limit import (
    rate_limit_sessions_create,
    rate_limit_sessions_read,
    rate_limit_sessions_update,
    rate_limit_sessions_delete,
    rate_limit_sources_ingest,
    rate_limit_sources_read,
    rate_limit_sources_delete,
)
from app.db.models.user import User
from app.schemas.sessions import SessionCreate, SessionRead, SessionUpdate
from app.schemas.sources import SourceCreate, SourceRead
from app.services.session_service import (
    create_session,
    get_user_sessions,
    get_session,
    update_session,
    delete_session,
    get_session_sources,
    add_source_to_session,
    remove_source_from_session,
)

router = APIRouter()

@router.get("/", response_model=List[SessionRead], dependencies=[Depends(rate_limit_sessions_read)])
async def read_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 20,
):
    """Retrieve research sessions for the current user."""
    return await get_user_sessions(db, current_user.id, skip=skip, limit=limit)

@router.post("/", response_model=SessionRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_sessions_create)])
async def create_new_session(
    *,
    db: AsyncSession = Depends(get_db),
    session_in: SessionCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new research session."""
    return await create_session(db=db, session_in=session_in, user_id=current_user.id)

@router.get("/{session_id}", response_model=SessionRead, dependencies=[Depends(rate_limit_sessions_read)])
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

@router.patch("/{session_id}", response_model=SessionRead, dependencies=[Depends(rate_limit_sessions_update)])
async def update_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    session_in: SessionUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update a specific session title, status, or summary."""
    session = await update_session(db, session_id=session_id, session_in=session_in, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit_sessions_delete)])
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

@router.get("/{session_id}/sources", response_model=List[SourceRead], dependencies=[Depends(rate_limit_sources_read)])
async def read_session_sources_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Get all sources attached to a specific session."""
    return await get_session_sources(db, session_id=session_id, user_id=current_user.id)

@router.post("/{session_id}/sources", response_model=SourceRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_sources_ingest)])
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
    await add_source_to_session(db, session_id=session_id, source_id=src.id, user_id=current_user.id)
    return src

@router.delete("/{session_id}/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit_sources_delete)])
async def detach_source_from_session_endpoint(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Detach a source from a session."""
    success = await remove_source_from_session(db, session_id=session_id, source_id=source_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Session or source link not found")
    return None


