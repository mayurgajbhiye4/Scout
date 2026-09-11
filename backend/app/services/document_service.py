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

        # Auto-derive a human-readable filename when one is not provided.
        # For GitHub repos this becomes "owner/repo" (e.g. "hashicorp/raft").
        filename = data.filename
        if not filename and data.url:
            if data.source_type == "github":
                import re
                m = re.search(r"github\.com/([^/]+/[^/?\s]+)", data.url)
                filename = m.group(1).removesuffix(".git") if m else data.url
            else:
                # For any URL: derive a readable label from the URL
                try:
                    from urllib.parse import urlparse
                    parsed = urlparse(data.url)
                    host = parsed.netloc.removeprefix("www.")
                    path = parsed.path.rstrip("/")
                    # Use last two path segments when available, e.g. "pgvector/pgvector"
                    parts = [p for p in path.split("/") if p]
                    if parts:
                        label = "/".join(parts[-2:]) if len(parts) >= 2 else parts[-1]
                        filename = f"{host} — {label}"
                    else:
                        filename = host
                except Exception:
                    filename = data.url

        document = Document(
            workspace_id=workspace_id,
            filename=filename or "Untitled",
            mime_type=data.mime_type or "text/plain",
            source_type=data.source_type,
            status="pending",
        )
        
        if data.url:
            document.metadata_ = {"url": data.url}
            
        if data.content:
            document.content = data.content
            
        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)
        
        logger.info("Document created", document_id=str(document.id), source_type=data.source_type)
        return document

    async def create_document_file(
        self,
        workspace_id: UUID,
        user_id: UUID,
        filename: str,
        mime_type: str,
        file_bytes: bytes,
    ) -> Document:
        """Create a document record from an uploaded file."""
        ws_service = WorkspaceService(self.db)
        await ws_service.get(workspace_id, user_id)

        document = Document(
            workspace_id=workspace_id,
            filename=filename,
            mime_type=mime_type,
            source_type="file",
            status="pending",
            metadata_={"file_size": len(file_bytes), "filename": filename},
        )
        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)

        logger.info(
            "Document created from uploaded file",
            document_id=str(document.id),
            filename=filename,
            size_bytes=len(file_bytes),
        )
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
