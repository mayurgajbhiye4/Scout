"""
MCP Tool Adapters — Wraps MCP tool calls into clean async Python callable interfaces for agents.
"""

from typing import Any
from app.tools.mcp.server import MCPServer


class MCPToolAdapter:
    """
    Adapter providing a clean interface for LangGraph nodes to invoke MCP tools.
    """

    def __init__(self, mcp_server: MCPServer | None = None) -> None:
        self.server = mcp_server or MCPServer()

    async def web_search(self, query: str, max_results: int = 5) -> list[dict[str, Any]]:
        res = await self.server.call_tool("web_search", {"query": query, "max_results": max_results})
        return res.get("results", [])

    async def fetch_webpage(self, url: str) -> dict[str, Any]:
        return await self.server.call_tool("fetch_webpage", {"url": url})

    async def search_files(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        res = await self.server.call_tool("search_files", {"query": query, "top_k": top_k})
        return res.get("results", [])

    async def search_github(self, query: str, repo: str | None = None) -> list[dict[str, Any]]:
        res = await self.server.call_tool("github_search", {"query": query, "repo": repo})
        return res.get("results", [])
