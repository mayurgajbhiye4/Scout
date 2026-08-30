"""
Research service for CRUD operations on sessions and reports.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.db.models.evidence import Evidence
from app.db.models.report import Report
from app.db.models.research_session import ResearchSession
from app.schemas.research import ResearchCreate
from app.services.workspace_service import WorkspaceService

logger = get_logger(__name__)


class ResearchService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_session(self, workspace_id: UUID, user_id: UUID, data: ResearchCreate) -> ResearchSession:
        """Create a new research session."""
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)

        session = ResearchSession(
            workspace_id=workspace_id,
            question=data.question,
            research_depth=data.research_depth,
            status="queued"
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        logger.info("Research session created", session_id=str(session.id))
        return session

    async def list_sessions(self, workspace_id: UUID, user_id: UUID) -> list[ResearchSession]:
        """List all research sessions in a workspace."""
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)

        result = await self.db.execute(
            select(ResearchSession).where(ResearchSession.workspace_id == workspace_id).order_by(ResearchSession.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_session(self, workspace_id: UUID, session_id: UUID, user_id: UUID) -> ResearchSession:
        """Get a specific research session."""
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)

        result = await self.db.execute(
            select(ResearchSession).where(
                ResearchSession.id == session_id,
                ResearchSession.workspace_id == workspace_id
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise NotFoundError("ResearchSession", str(session_id))
        return session
        
    async def get_report(self, session_id: UUID) -> Report:
        """Get the final report for a session."""
        result = await self.db.execute(
            select(Report).where(Report.research_session_id == session_id)
        )
        report = result.scalar_one_or_none()
        if not report:
            raise NotFoundError("Report for Session", str(session_id))
        return report

    async def get_evidence(self, session_id: UUID) -> list[Evidence]:
        """Get all evidence items for a session."""
        result = await self.db.execute(
            select(Evidence).where(Evidence.research_session_id == session_id)
        )
        return list(result.scalars().all())
