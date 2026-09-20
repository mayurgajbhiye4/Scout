"""Sources API router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.api.deps import get_db, get_current_user
from app.db.models.user import User
from app.schemas.sources import SourceCreate, SourceRead
from app.services.source_service import create_source, get_user_sources, delete_source

router = APIRouter()

@router.get("/", response_model=List[SourceRead])
async def read_sources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    """Retrieve sources for the current user."""
    return await get_user_sources(db, current_user.id, skip=skip, limit=limit)

@router.post("/", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
async def create_new_source(
    *,
    db: AsyncSession = Depends(get_db),
    source_in: SourceCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new source."""
    return await create_source(db=db, source_in=source_in, user_id=current_user.id)

@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
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

