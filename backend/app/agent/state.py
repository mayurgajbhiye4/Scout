"""LangGraph state definition."""
from typing import TypedDict, List, Optional
from langchain_core.messages import BaseMessage

class ResearchChatState(TypedDict, total=False):
    session_id: str
    user_id: Optional[str]
    messages: List[BaseMessage]
    # This turn's message alone; the last entry of `messages` may also hold earlier unanswered messages
    question: Optional[str]
    source_ids: List[str]
    retrieved_chunks: List[dict]
    session_memories: Optional[List[dict]]
    graph_context: Optional[str]
    # {"entities": [...], "memories": [...]} from the knowledge graph (see Neo4jGraphEngine.get_graph_evidence)
    graph_evidence: Optional[dict]
    needs_web_search: bool
    web_search_results: List[dict]
    citations: List[dict]
    # Follow-up questions the answer model wrote after FOLLOW_UPS_MARKER (never streamed to the user)
    follow_ups: List[str]
    error: Optional[str]
    # Evidence check & retries: every search run so far ({"source": "library"|"web", "query", "found"}),
    # the grader's last verdict, and the queries / source it chose for the next attempt
    searched: List[dict]
    evidence_verdict: Optional[dict]
    search_query: Optional[str]  # First of search_queries, kept for progress events
    search_queries: List[str]
    next_source: Optional[str]
    # Library source ids and web URLs the grader set aside as off-topic; later searches never bring them back
    rejected: List[str]
    retrieval_attempts: int
