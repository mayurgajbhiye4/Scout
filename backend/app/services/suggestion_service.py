"""
Fallback research threads (typed follow-up questions) for research chat, used when the answer model wrote none.

Short, one-line questions that never quote a source's title, built from evidence the pipeline already has,
with no LLM call and no web search:
  - knowledge graph: concepts matched by the question and the concepts related to them
  - library retrieval: the documents the answer drew on, and the central concepts they mention
    (one extra graph lookup)
"""

import asyncio
from typing import Any

from app.retrieval.keywords import extract_query_keywords

MAX_QUESTION_CHARS = 90


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


def _thread(kind: str, question: str, text: str = "", concept: str | None = None) -> dict[str, Any]:
    thread: dict[str, Any] = {"kind": kind, "text": text, "question": question}
    if concept:
        thread["concept"] = concept
    return thread


def build_threads(
    question: str,
    graph_evidence: dict[str, Any] | None,
    retrieved_chunks: list[dict[str, Any]] | None,
    document_entities: list[dict[str, Any]] | None,
    count: int = 3,
) -> list[dict[str, Any]]:
    """Pick diverse research threads ({kind, text, question, concept?}), round-robin across kinds."""
    entities = (graph_evidence or {}).get("entities", [])
    chunks = retrieved_chunks or []

    # 1. Graph relationships: matched concept -> related concept not yet asked about
    relations = []
    for ent in entities:
        for nb in ent.get("neighbors", []):
            if not _mentioned(nb.get("label", ""), question):
                relations.append(
                    _thread(
                        "deeper",
                        f"How does {nb['label']} relate to {ent['label']}?",
                        concept=nb["label"],
                    )
                )

    # 2. Central concepts in the documents the answer used
    doc_concepts = []
    for de in document_entities or []:
        label = de.get("label")
        if label and de.get("source_title") and not _mentioned(label, question):
            doc_concepts.append(_thread("deeper", f"Why does {label} matter here?", concept=label))

    # 3. Library documents: where they disagree, or what they leave open
    titles = {ch["source_title"] for ch in chunks if ch.get("source_title")}
    documents = []
    # Plain questions: with no model reading the sources, there is no actual gap or conflict to state
    if len(titles) >= 2:
        documents.append(_thread("deeper", "Where do these sources disagree?"))
    if titles:
        documents.append(
            _thread("deeper", "What open questions do these sources leave?")
            if len(titles) >= 2
            else _thread("deeper", "What limitations does this source admit?")
        )

    # 4. Matched concepts without relations: go one level deeper
    deeper = [
        _thread("deeper", f"What are the trade-offs of {e['label']}?", concept=e["label"])
        for e in entities
        if e.get("label")
    ]

    threads: list[dict[str, Any]] = []
    seen = set()
    pools = [relations, doc_concepts, documents, deeper]
    while len(threads) < count and any(pools):
        for pool in pools:
            while pool:
                t = pool.pop(0)
                key = t["question"].lower()
                if key not in seen and len(t["question"]) <= MAX_QUESTION_CHARS:
                    seen.add(key)
                    threads.append(t)
                    break
            if len(threads) >= count:
                break
    return threads


def build_suggestions(
    question: str,
    graph_evidence: dict[str, Any] | None,
    retrieved_chunks: list[dict[str, Any]] | None,
    document_entities: list[dict[str, Any]] | None,
    count: int = 3,
) -> list[str]:
    """Just the questions of `build_threads`."""
    return [
        t["question"]
        for t in build_threads(question, graph_evidence, retrieved_chunks, document_entities, count)
    ]


async def suggest_threads(
    question: str,
    user_id: str | None,
    graph_evidence: dict[str, Any] | None,
    retrieved_chunks: list[dict[str, Any]] | None,
    cited_source_ids: list[str],
    count: int = 3,
) -> list[dict[str, Any]]:
    """Threads for an answer. Web-only answers get none: there is nothing in the user's
    library or graph to build on, and suggestions never trigger a web search."""
    source_ids = cited_source_ids or [
        c["source_id"] for c in (retrieved_chunks or []) if c.get("source_id")
    ]
    document_entities: list[dict[str, Any]] = []
    if user_id and source_ids:
        try:
            from app.graph.engine import graph_engine

            if graph_engine:
                document_entities = await asyncio.to_thread(
                    graph_engine.get_document_entities,
                    list(dict.fromkeys(source_ids))[:6],
                    str(user_id),
                )
        except Exception as e:
            print(f"Suggestion graph lookup failed: {e}")
    return build_threads(question, graph_evidence, retrieved_chunks, document_entities, count)


async def suggest_follow_ups(
    question: str,
    user_id: str | None,
    graph_evidence: dict[str, Any] | None,
    retrieved_chunks: list[dict[str, Any]] | None,
    cited_source_ids: list[str],
    count: int = 3,
) -> list[str]:
    """Just the questions of `suggest_threads`."""
    threads = await suggest_threads(
        question, user_id, graph_evidence, retrieved_chunks, cited_source_ids, count
    )
    return [t["question"] for t in threads]
