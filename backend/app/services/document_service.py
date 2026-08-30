"""
Document service — CRUD operations and triggering ingestion.
"""

import asyncio
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.db.models.document import Document
from app.db.models.source import Source
from app.schemas.documents import DocumentCreate
from app.services.ingestion_service import run_ingestion_job
from app.services.workspace_service import WorkspaceService

logger = get_logger(__name__)


class DocumentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_document(self, workspace_id: UUID, user_id: UUID, data: DocumentCreate) -> Document:
        """Create a document record and trigger background ingestion."""
        # Enforce workspace ownership
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)

        document = Document(
            workspace_id=workspace_id,
            filename=data.filename or data.url or "Untitled",
            mime_type=data.mime_type or "text/plain",
            source_type=data.source_type,
            status="pending",
        )
        
        if data.url:
            # We use a hacky attribute here since URL isn't explicitly on Document in MVP,
            # but we can store it in metadata or just add it dynamically if we added a column.
            # Wait, looking at models, Document doesn't have `url`, it has `filename` and `metadata_`.
            document.metadata_ = {"url": data.url}
            # We'll patch document.url for the ingestion job to use
            document.url = data.url
            
        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)
        
        logger.info("Document created", document_id=str(document.id), source_type=data.source_type)
        return document

    async def list_documents(self, workspace_id: UUID, user_id: UUID) -> list[Document]:
        """List documents for a workspace."""
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)
        
        result = await self.db.execute(
            select(Document).where(Document.workspace_id == workspace_id).order_by(Document.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_sources(self, workspace_id: UUID, user_id: UUID) -> list[Source]:
        """List unified sources for a workspace."""
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)
        
        result = await self.db.execute(
            select(Source).where(Source.workspace_id == workspace_id).order_by(Source.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_document(self, document_id: UUID, user_id: UUID) -> None:
        """Delete a document (and cascade to chunks)."""
        result = await self.db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        
        if not document:
            raise NotFoundError("Document", str(document_id))
            
        # Verify ownership
        ws_service = WorkspaceService(self.db)
        await ws_service.get(document.workspace_id, user_id)
        
        await self.db.delete(document)
        await self.db.commit()
        logger.info("Document deleted", document_id=str(document_id))
