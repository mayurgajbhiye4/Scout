"""
Tool abstractions and registry for AI Research Workspace agents.
"""

from typing import Any, Protocol


class ToolProtocol(Protocol):
    name: str
    description: str

    async def execute(self, **kwargs: Any) -> dict[str, Any]:
        ...


from app.tools.file_search import FileSearchTool
from app.tools.github_search import GitHubSearchTool
from app.tools.notion_import import NotionImportTool
from app.tools.web_search import WebSearchTool
from app.tools.webpage_loader import WebpageLoaderTool
from app.tools.youtube_transcript import YouTubeTranscriptTool

__all__ = [
    "ToolProtocol",
    "WebSearchTool",
    "WebpageLoaderTool",
    "FileSearchTool",
    "YouTubeTranscriptTool",
    "GitHubSearchTool",
    "NotionImportTool",
]
