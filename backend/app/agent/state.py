"""LangGraph state definition."""
from typing import TypedDict, List, Optional, Any
from langchain_core.messages import BaseMessage

class ResearchChatState(TypedDict):
    session_id: str
    messages: List[BaseMessage]
    source_ids: List[str]
    retrieved_chunks: List[dict]
    needs_web_search: bool
    web_search_results: List[dict]
    citations: List[dict]
    error: Optional[str]
