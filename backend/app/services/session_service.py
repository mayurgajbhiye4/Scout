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
    stmt = select(ResearchSession).where(ResearchSession.id == session_id, ResearchSession.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalars().first()

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
    return session
