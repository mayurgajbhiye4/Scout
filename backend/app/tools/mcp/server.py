"""
Model Context Protocol (MCP) Server — Exposes research tools via standardized MCP interfaces.
"""

from typing import Any
from app.core.logging import get_logger
from app.tools.file_search import FileSearchTool
from app.tools.github_search import GitHubSearchTool
from app.tools.web_search import WebSearchTool
from app.tools.webpage_loader import WebpageLoaderTool

logger = get_logger(__name__)


class MCPServer:
    """
    Lightweight in-process Model Context Protocol server exposing tool capabilities.
    """

    def __init__(self) -> None:
        self.web_search = WebSearchTool()
        self.webpage_loader = WebpageLoaderTool()
        self.file_search = FileSearchTool()
        self.github_search = GitHubSearchTool()

    def list_tools(self) -> list[dict[str, Any]]:
        """Returns JSON schema definitions of all available MCP tools."""
        return [
            {
                "name": "web_search",
                "description": "Searches the public web for technical documentation and reports.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "max_results": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "fetch_webpage",
                "description": "Fetches and cleans text content from an external URL.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "Target webpage URL"},
                    },
                    "required": ["url"],
                },
            },
            {
                "name": "search_files",
                "description": "Searches indexed workspace files and document chunks.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Semantic query"},
                        "top_k": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "github_search",
                "description": "Searches GitHub code files and repositories.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Code or repo search query"},
                        "repo": {"type": "string", "description": "Optional repository filter"},
                    },
                    "required": ["query"],
                },
            },
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Dispatch a tool call to the respective backend adapter."""
        logger.info("MCP tool invoked", tool_name=name, arguments=arguments)

        if name == "web_search":
            return await self.web_search.execute(**arguments)
        elif name == "fetch_webpage":
            return await self.webpage_loader.execute(**arguments)
        elif name == "search_files":
            return await self.file_search.execute(**arguments)
        elif name == "github_search":
            return await self.github_search.execute(**arguments)
        else:
            return {"error": f"Unknown tool '{name}'"}
