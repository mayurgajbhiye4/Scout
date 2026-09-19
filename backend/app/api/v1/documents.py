"""Document and Source API endpoints."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
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
    
    # Run the ingestion pipeline in the background with provided content (if any)
    background_tasks.add_task(run_ingestion_job, db, document, data.content)
    
    return {"data": DocumentResponse.model_validate(document).model_dump(mode="json"), "meta": {}}


@router.post("/workspaces/{workspace_id}/documents/upload", response_model=dict, status_code=201)
async def upload_document(
    workspace_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF, TXT, MD, or DOCX document file for ingestion and vector indexing."""
    file_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "uploaded_document"

    service = DocumentService(db)
    document = await service.create_document_file(
        workspace_id=workspace_id,
        user_id=user_id,
        filename=filename,
        mime_type=mime_type,
        file_bytes=file_bytes,
    )

    # Run the ingestion pipeline in the background with file bytes
    background_tasks.add_task(run_ingestion_job, db, document, file_bytes)

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


@router.delete("/workspaces/{workspace_id}/sources/{source_id}", status_code=204)
async def delete_source(
    workspace_id: UUID,
    source_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a source from a workspace."""
    service = DocumentService(db)
    await service.delete_source(workspace_id, source_id, user_id)

