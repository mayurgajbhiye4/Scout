"""Research API endpoints."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.research import EvidenceResponse, ReportResponse, ResearchCreate, ResearchSessionResponse
from app.services.research_job import execute_research_job
from app.services.research_service import ResearchService

router = APIRouter()


@router.post("/workspaces/{workspace_id}/research", response_model=dict, status_code=201)
async def create_research_session(
    workspace_id: UUID,
    data: ResearchCreate,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Start a new autonomous research session."""
    service = ResearchService(db)
    session = await service.create_session(workspace_id, user_id, data)
    
    # Fire and forget the LangGraph workflow
    background_tasks.add_task(execute_research_job, db, str(session.id))
    
    return {"data": ResearchSessionResponse.model_validate(session).model_dump(mode="json"), "meta": {}}


@router.get("/workspaces/{workspace_id}/research", response_model=dict)
async def list_research_sessions(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all research sessions in a workspace."""
    service = ResearchService(db)
    sessions = await service.list_sessions(workspace_id, user_id)
    return {"data": [ResearchSessionResponse.model_validate(s).model_dump(mode="json") for s in sessions], "meta": {}}


@router.get("/workspaces/{workspace_id}/research/{session_id}", response_model=dict)
async def get_research_session(
    workspace_id: UUID,
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get status of a specific research session."""
    service = ResearchService(db)
    session = await service.get_session(workspace_id, session_id, user_id)
    return {"data": ResearchSessionResponse.model_validate(session).model_dump(mode="json"), "meta": {}}


@router.get("/workspaces/{workspace_id}/research/{session_id}/report", response_model=dict)
async def get_research_report(
    workspace_id: UUID,
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get the final generated report."""
    service = ResearchService(db)
    # Validate ownership via session lookup
    await service.get_session(workspace_id, session_id, user_id)
    report = await service.get_report(session_id)
    return {"data": ReportResponse.model_validate(report).model_dump(mode="json"), "meta": {}}


@router.get("/workspaces/{workspace_id}/research/{session_id}/evidence", response_model=dict)
async def get_research_evidence(
    workspace_id: UUID,
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get all evidence items gathered during the research."""
    service = ResearchService(db)
    await service.get_session(workspace_id, session_id, user_id)
    evidence = await service.get_evidence(session_id)
    return {"data": [EvidenceResponse.model_validate(e).model_dump(mode="json") for e in evidence], "meta": {}}
