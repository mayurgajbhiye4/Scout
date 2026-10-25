"""
Follow-up question suggestions for research chat.

Built from evidence the pipeline already has, with no LLM call and no web search:
  - knowledge graph: concepts matched by the question and the concepts related to them
  - library retrieval: the documents the answer drew on, and the central concepts they mention
    (one extra graph lookup)
"""

import asyncio
from typing import Any, Dict, List

from app.retrieval.keywords import extract_query_keywords

MAX_TITLE_CHARS = 60
MAX_QUESTION_CHARS = 140


def _short(title: str) -> str:
    title = " ".join((title or "").split())
    return title if len(title) <= MAX_TITLE_CHARS else title[: MAX_TITLE_CHARS - 1].rstrip() + "…"


def _mentioned(label: str, question: str) -> bool:
    """True when the concept is already part of the question (so suggesting it adds nothing)."""
    label_l = (label or "").lower().strip()
    if not label_l:
        return True
    question_l = question.lower()
    if label_l in question_l:
        return True
    words = extract_query_keywords(label_l)
    return bool(words) and all(w in question_l for w in words)


def build_suggestions(
    question: str,
    graph_evidence: Dict[str, Any] | None,
    retrieved_chunks: List[Dict[str, Any]] | None,
    document_entities: List[Dict[str, Any]] | None,
    count: int = 3,
) -> List[str]:
    """Pick diverse follow-up questions, round-robin across kinds so one kind doesn't dominate."""
    entities = (graph_evidence or {}).get("entities", [])
    chunks = retrieved_chunks or []

    # 1. Graph relationships: matched concept -> related concept not yet asked about
    relations = []
    for ent in entities:
        for nb in ent.get("neighbors", []):
            if not _mentioned(nb.get("label", ""), question):
                relations.append(f"How does {nb['label']} relate to {ent['label']}?")

    # 2. Central concepts in the documents the answer used
    doc_concepts = []
    for de in document_entities or []:
        label, title = de.get("label"), de.get("source_title")
        if label and title and not _mentioned(label, question):
            doc_concepts.append(f"What does “{_short(title)}” say about {label}?")

    # 3. Library documents: compare two, or dig into one
    titles: List[str] = []
    for ch in chunks:
        t = ch.get("source_title")
        if t and t not in titles:
            titles.append(t)
    documents = []
    if len(titles) >= 2:
        documents.append(f"Where do “{_short(titles[0])}” and “{_short(titles[1])}” agree or disagree?")
    for t in titles[:2]:
        documents.append(f"What limitations or open questions does “{_short(t)}” raise?")

    # 4. Matched concepts without relations: go one level deeper
    deeper = [f"What are the practical trade-offs of {e['label']}?" for e in entities if e.get("label")]

    suggestions: List[str] = []
    seen = set()
    pools = [relations, doc_concepts, documents, deeper]
    while len(suggestions) < count and any(pools):
        for pool in pools:
            while pool:
                q = pool.pop(0)
                key = q.lower()
                if key not in seen and len(q) <= MAX_QUESTION_CHARS:
                    seen.add(key)
                    suggestions.append(q)
                    break
            if len(suggestions) >= count:
                break
    return suggestions


async def suggest_follow_ups(
    question: str,
    user_id: str | None,
    graph_evidence: Dict[str, Any] | None,
    retrieved_chunks: List[Dict[str, Any]] | None,
    cited_source_ids: List[str],
    count: int = 3,
) -> List[str]:
    """Suggestions for an answer. Web-only answers get none: there is nothing in the user's
    library or graph to build on, and suggestions never trigger a web search."""
    source_ids = cited_source_ids or [c["source_id"] for c in (retrieved_chunks or []) if c.get("source_id")]
    document_entities: List[Dict[str, Any]] = []
    if user_id and source_ids:
        try:
            from app.graph.engine import graph_engine
            if graph_engine:
                document_entities = await asyncio.to_thread(
                    graph_engine.get_document_entities, list(dict.fromkeys(source_ids))[:6], str(user_id)
                )
        except Exception as e:
            print(f"Suggestion graph lookup failed: {e}")
    return build_suggestions(question, graph_evidence, retrieved_chunks, document_entities, count)
