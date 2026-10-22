"""Sources API router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.api.deps import get_db, get_current_user
from app.core.rate_limit import (
    rate_limit_sources_ingest,
    rate_limit_sources_read,
    rate_limit_sources_delete,
)
from app.db.models.user import User
from app.schemas.sources import SourceCreate, SourceRead
from app.services.source_service import create_source, get_user_sources, delete_source, get_source

router = APIRouter()

@router.get("/", response_model=List[SourceRead], dependencies=[Depends(rate_limit_sources_read)])
async def read_sources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 20,
):
    """Retrieve sources for the current user."""
    return await get_user_sources(db, current_user.id, skip=skip, limit=limit)

@router.get("/{source_id}", response_model=SourceRead, dependencies=[Depends(rate_limit_sources_read)])
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

@router.post("/", response_model=SourceRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_sources_ingest)])
async def create_new_source(
    *,
    db: AsyncSession = Depends(get_db),
    source_in: SourceCreate,
    current_user: User = Depends(get_current_user),
):
    """Create and ingest a new source."""
    return await create_source(db=db, source_in=source_in, user_id=current_user.id)

@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit_sources_delete)])
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


