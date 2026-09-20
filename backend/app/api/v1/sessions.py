"""Sessions API router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.api.deps import get_db, get_current_user
from app.db.models.user import User
from app.schemas.sessions import SessionCreate, SessionRead, SessionUpdate
from app.services.session_service import create_session, get_user_sessions, get_session

router = APIRouter()

@router.get("/", response_model=List[SessionRead])
async def read_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    """Retrieve research sessions for the current user."""
    return await get_user_sessions(db, current_user.id, skip=skip, limit=limit)

@router.post("/", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
async def create_new_session(
    *,
    db: AsyncSession = Depends(get_db),
    session_in: SessionCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new research session."""
    return await create_session(db=db, session_in=session_in, user_id=current_user.id)

@router.get("/{session_id}", response_model=SessionRead)
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
