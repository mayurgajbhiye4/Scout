"""Workspace API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.workspaces import WorkspaceCreate, WorkspaceListResponse, WorkspaceResponse, WorkspaceUpdate
from app.services.workspace_service import WorkspaceService

router = APIRouter()


@router.post("", response_model=dict, status_code=201)
async def create_workspace(
    data: WorkspaceCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workspace."""
    service = WorkspaceService(db)
    workspace = await service.create(user_id, data)
    return {"data": WorkspaceResponse.model_validate(workspace).model_dump(mode="json"), "meta": {}}


@router.get("", response_model=dict)
async def list_workspaces(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List workspaces for the current user."""
    service = WorkspaceService(db)
    workspaces = await service.list_for_user(user_id)
    return {"data": [WorkspaceListResponse.model_validate(w).model_dump(mode="json") for w in workspaces], "meta": {}}


@router.get("/{workspace_id}", response_model=dict)
async def get_workspace(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a workspace by ID."""
    service = WorkspaceService(db)
    workspace = await service.get(workspace_id, user_id)
    return {"data": WorkspaceResponse.model_validate(workspace).model_dump(mode="json"), "meta": {}}


@router.patch("/{workspace_id}", response_model=dict)
async def update_workspace(
    workspace_id: UUID,
    data: WorkspaceUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a workspace."""
    service = WorkspaceService(db)
    workspace = await service.update(workspace_id, user_id, data)
    return {"data": WorkspaceResponse.model_validate(workspace).model_dump(mode="json"), "meta": {}}


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a workspace."""
    service = WorkspaceService(db)
    await service.delete(workspace_id, user_id)
