"""Session service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import uuid
from typing import List, Optional

from app.db.models.research_session import ResearchSession
from app.schemas.sessions import SessionCreate

async def get_user_sessions(db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 100) -> List[ResearchSession]:
    stmt = select(ResearchSession).where(ResearchSession.user_id == user_id).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

async def get_session(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> Optional[ResearchSession]:
    from sqlalchemy.orm import selectinload
    from app.db.models.session_source import SessionSource
    stmt = (
        select(ResearchSession)
        .where(ResearchSession.id == session_id, ResearchSession.user_id == user_id)
        .options(selectinload(ResearchSession.session_sources).selectinload(SessionSource.source))
    )
    result = await db.execute(stmt)
    session = result.scalars().first()
    if session:
        session.sources = [ss.source for ss in session.session_sources if ss.source]
    return session

async def create_session(db: AsyncSession, session_in: SessionCreate, user_id: uuid.UUID) -> ResearchSession:
    session = ResearchSession(
        user_id=user_id,
        title=session_in.title or "New Session",
        mode=session_in.mode,
        source_policy=session_in.source_policy,
        last_activity_at=datetime.utcnow()
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    if session_in.source_ids:
        from app.db.models.session_source import SessionSource
        for sid in session_in.source_ids:
            session_source = SessionSource(session_id=session.id, source_id=sid)
            db.add(session_source)
        await db.commit()

    return session

async def get_session_sources(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> List:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return []
    return session.sources or []

async def add_source_to_session(db: AsyncSession, session_id: uuid.UUID, source_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return False
    from app.db.models.session_source import SessionSource
    stmt = select(SessionSource).where(SessionSource.session_id == session_id, SessionSource.source_id == source_id)
    res = await db.execute(stmt)
    if not res.scalars().first():
        db.add(SessionSource(session_id=session_id, source_id=source_id))
        await db.commit()
    return True

async def remove_source_from_session(db: AsyncSession, session_id: uuid.UUID, source_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return False
    from app.db.models.session_source import SessionSource
    stmt = select(SessionSource).where(SessionSource.session_id == session_id, SessionSource.source_id == source_id)
    res = await db.execute(stmt)
    ss = res.scalars().first()
    if ss:
        await db.delete(ss)
        await db.commit()
    return True

async def delete_session(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return False
    await db.delete(session)
    await db.commit()
    return True

