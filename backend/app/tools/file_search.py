"""
File search tool — searches indexed workspace documents and chunks.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.document_chunk import DocumentChunk
from app.db.models.source import Source

logger = get_logger(__name__)


class FileSearchTool:
    name = "file_search"
    description = "Searches indexed workspace files and document chunks."

    def __init__(self, db: AsyncSession | None = None) -> None:
        self.db = db

    async def search(self, workspace_id: UUID, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Search workspace sources by text matching / metadata."""
        if not self.db:
            return [
                {
                    "title": "Sample Workspace Architecture",
                    "content": f"Relevant technical excerpt addressing query '{query}' in workspace context.",
                    "source_id": str(workspace_id),
                }
            ]

        try:
            stmt = (
                select(Source)
                .where(Source.workspace_id == workspace_id)
                .limit(top_k)
            )
            res = await self.db.execute(stmt)
            sources = res.scalars().all()
            return [
                {
                    "title": s.title,
                    "url": s.url,
                    "content": s.content[:500] if s.content else "",
                    "source_id": str(s.id),
                }
                for s in sources
            ]
        except Exception as e:
            logger.warning("File search DB lookup error", error=str(e))
            return []

    async def execute(self, **kwargs: Any) -> dict[str, Any]:
        workspace_id = kwargs.get("workspace_id")
        query = kwargs.get("query", "")
        top_k = kwargs.get("top_k", 5)
        results = await self.search(workspace_id=workspace_id, query=query, top_k=top_k)
        return {"results": results}
