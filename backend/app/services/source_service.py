"""Source service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from typing import List

from app.db.models.source import Source, SourceType, SourceStatus
from app.schemas.sources import SourceCreate

async def get_user_sources(db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 100) -> List[Source]:
    stmt = select(Source).where(Source.user_id == user_id).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

async def create_source(db: AsyncSession, source_in: SourceCreate, user_id: uuid.UUID) -> Source:
    source = Source(
        user_id=user_id,
        source_type=SourceType.website, # Simplified for stub
        title=source_in.url or "New Source",
        canonical_uri=source_in.url,
        status=SourceStatus.pending,
        metadata_={},
    )
    db.add(source)
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

