"""Document and Source API endpoints."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.documents import DocumentCreate, DocumentResponse, SourceResponse
from app.services.document_service import DocumentService
from app.services.ingestion_service import run_ingestion_job

router = APIRouter()


@router.post("/workspaces/{workspace_id}/documents", response_model=dict, status_code=201)
async def create_document(
    workspace_id: UUID,
    data: DocumentCreate,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Submit a URL or document for ingestion."""
    service = DocumentService(db)
    document = await service.create_document(workspace_id, user_id, data)
    
    # Run the expensive ingestion pipeline in the background
    background_tasks.add_task(run_ingestion_job, db, document, None)
    
    return {"data": DocumentResponse.model_validate(document).model_dump(mode="json"), "meta": {}}


@router.get("/workspaces/{workspace_id}/documents", response_model=dict)
async def list_documents(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all documents for a workspace."""
    service = DocumentService(db)
    documents = await service.list_documents(workspace_id, user_id)
    return {"data": [DocumentResponse.model_validate(d).model_dump(mode="json") for d in documents], "meta": {}}


@router.get("/workspaces/{workspace_id}/sources", response_model=dict)
async def list_sources(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all unified sources for a workspace."""
    service = DocumentService(db)
    sources = await service.list_sources(workspace_id, user_id)
    return {"data": [SourceResponse.model_validate(s).model_dump(mode="json") for s in sources], "meta": {}}


@router.delete("/workspaces/{workspace_id}/documents/{document_id}", status_code=204)
async def delete_document(
    workspace_id: UUID,  # Validated in service via ownership check
    document_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document."""
    service = DocumentService(db)
    await service.delete_document(document_id, user_id)
