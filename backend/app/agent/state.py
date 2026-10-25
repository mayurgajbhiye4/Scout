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
    # {"entities": [...], "memories": [...]} from the knowledge graph (see Neo4jGraphEngine.get_graph_evidence)
    graph_evidence: Optional[dict]
    needs_web_search: bool
    web_search_results: List[dict]
    citations: List[dict]
    error: Optional[str]
    # Evidence check & retries: every search run so far ({"source": "library"|"web", "query", "found"}),
    # the grader's last verdict, and the rewritten query / source chosen for the next attempt
    searched: List[dict]
    evidence_verdict: Optional[dict]
    search_query: Optional[str]
    next_source: Optional[str]
    retrieval_attempts: int
