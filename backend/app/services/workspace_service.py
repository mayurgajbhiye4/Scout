"""
Workspace service — CRUD operations with ownership enforcement.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.logging import get_logger
from app.db.models.document import Document
from app.db.models.research_session import ResearchSession
from app.db.models.source import Source
from app.db.models.workspace import Workspace
from app.schemas.workspaces import WorkspaceCreate, WorkspaceUpdate

logger = get_logger(__name__)


class WorkspaceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, user_id: UUID, data: WorkspaceCreate) -> Workspace:
        """Create a new workspace owned by the specified user."""
        workspace = Workspace(
            user_id=user_id,
            name=data.name,
            description=data.description,
        )
        self.db.add(workspace)
        await self.db.commit()
        await self.db.refresh(workspace)
        logger.info("Workspace created", workspace_id=str(workspace.id), user_id=str(user_id))
        return workspace

    async def list_for_user(self, user_id: UUID) -> list[dict]:
        """List all workspaces owned by the user with counts."""
        result = await self.db.execute(
            select(Workspace).where(Workspace.user_id == user_id).order_by(Workspace.updated_at.desc())
        )
        workspaces = result.scalars().all()

        items = []
        for ws in workspaces:
            source_count = await self._count(Source, Source.workspace_id == ws.id)
            research_count = await self._count(
                ResearchSession, ResearchSession.workspace_id == ws.id
            )
            items.append({
                "id": ws.id,
                "name": ws.name,
                "description": ws.description,
                "created_at": ws.created_at,
                "source_count": source_count,
                "research_count": research_count,
            })
        return items

    async def get(self, workspace_id: UUID, user_id: UUID) -> Workspace:
        """Get a workspace by ID, enforcing ownership."""
        workspace = await self._get_owned(workspace_id, user_id)
        return workspace

    async def update(self, workspace_id: UUID, user_id: UUID, data: WorkspaceUpdate) -> Workspace:
        """Update workspace fields, enforcing ownership."""
        workspace = await self._get_owned(workspace_id, user_id)

        if data.name is not None:
            workspace.name = data.name
        if data.description is not None:
            workspace.description = data.description

        await self.db.commit()
        await self.db.refresh(workspace)
        logger.info("Workspace updated", workspace_id=str(workspace_id))
        return workspace

    async def delete(self, workspace_id: UUID, user_id: UUID) -> None:
        """Delete a workspace, enforcing ownership."""
        workspace = await self._get_owned(workspace_id, user_id)
        await self.db.delete(workspace)
        await self.db.commit()
        logger.info("Workspace deleted", workspace_id=str(workspace_id))

    # ── Internal helpers ─────────────────────────────────────────────────

    async def _get_owned(self, workspace_id: UUID, user_id: UUID) -> Workspace:
        result = await self.db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()
        if workspace is None:
            raise NotFoundError("Workspace", str(workspace_id))
        if workspace.user_id != user_id:
            raise AuthorizationError("You do not own this workspace")
        return workspace

    async def _count(self, model, condition) -> int:
        result = await self.db.execute(select(func.count()).select_from(model).where(condition))
        return result.scalar() or 0
