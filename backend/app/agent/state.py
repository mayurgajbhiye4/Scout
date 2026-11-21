"""LangGraph state definition."""

from typing import TypedDict

from langchain_core.messages import BaseMessage


class ResearchChatState(TypedDict, total=False):
    session_id: str
    user_id: str | None
    messages: list[BaseMessage]
    # This turn's message alone; the last entry of `messages` may also hold earlier unanswered messages
    question: str | None
    source_ids: list[str]
    retrieved_chunks: list[dict]
    session_memories: list[dict] | None
    graph_context: str | None
    # {"entities": [...], "memories": [...]} from the knowledge graph (see Neo4jGraphEngine.get_graph_evidence)
    graph_evidence: dict | None
    needs_web_search: bool
    web_search_results: list[dict]
    citations: list[dict]
    # Follow-up questions the answer model wrote after FOLLOW_UPS_MARKER (never streamed to the user)
    follow_ups: list[str]
    # The source blocks the answer model saw, as plain text (RAGAS retrieved_contexts)
    contexts: list[str]
    error: str | None
    # Evidence check & retries: every search run so far ({"source": "library"|"web", "query", "found"}),
    # the grader's last verdict, and the queries / source it chose for the next attempt
    searched: list[dict]
    evidence_verdict: dict | None
    search_query: str | None  # First of search_queries, kept for progress events
    search_queries: list[str]
    next_source: str | None
    # Library source ids and web URLs the grader set aside as off-topic; later searches never bring them back
    rejected: list[str]
    retrieval_attempts: int
