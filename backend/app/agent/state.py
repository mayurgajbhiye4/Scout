"""LangGraph state definition."""
from typing import TypedDict, List, Optional, Any
from langchain_core.messages import BaseMessage

class ResearchChatState(TypedDict, total=False):
    session_id: str
    user_id: Optional[str]
    messages: List[BaseMessage]
    source_ids: List[str]
    retrieved_chunks: List[dict]
    session_memories: Optional[List[dict]]
    graph_context: Optional[str]
    needs_web_search: bool
    web_search_results: List[dict]
    citations: List[dict]
    error: Optional[str]
