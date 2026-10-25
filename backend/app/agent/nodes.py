"""LangGraph nodes for Research Chat.

Retrieval pipeline per question:
  1. Knowledge graph (Neo4j): entities matching the question in the user's own documents, their
     related entities, and the documents linked to them.
  2. Library RAG (pgvector): semantic + keyword candidates across the user's library, boosted when
     the source is attached to the session or linked through the graph, then filtered by relevance.
  3. Web (Tavily): when the user asks for it, or when nothing in the library is relevant.
  4. Evidence check: before answering, an LLM grades whether the evidence answers the question. If it
     doesn't, it rewrites the query and the search runs again on the library or the web (switching source
     by default), up to CHAT_MAX_RETRIEVAL_RETRIES times. Evidence accumulates across attempts.
Every piece of evidence becomes a numbered source the answer must cite.
"""
import asyncio
import json
import re
import uuid

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.state import ResearchChatState
from app.core.config import settings
from app.core.rate_limit import enforce_pipeline_rate_limit
from app.retrieval.graph_facts import format_graph_facts
from app.retrieval.keywords import extract_query_keywords, keyword_overlap
from app.services.embedding_service import generate_embeddings
from app.tools.web_search import WebSearchTool

# Initialize LLM
llm = ChatGoogleGenerativeAI(
    model=settings.LLM_MODEL,
    google_api_key=settings.GEMINI_API_KEY,
    max_output_tokens=settings.CHAT_MAX_OUTPUT_TOKENS,
)
# Grades evidence and rewrites queries. Its runs are tagged so chat streaming never shows its output.
grader_llm = ChatGoogleGenerativeAI(
    model=settings.LLM_MODEL,
    google_api_key=settings.GEMINI_API_KEY,
    temperature=0,
    max_output_tokens=1024,
)
GRADER_TAG = "evidence_grader"
SEARCH_SOURCES = ("library", "web")

# Follow-ups shorter than this are retrieved together with the previous question,
# so "what about its limitations?" still finds the right sources.
FOLLOW_UP_MAX_WORDS = 12
# Below this, a message is treated as conversational and never triggers an automatic web search.
AUTO_WEB_SEARCH_MIN_WORDS = 4
# Candidates pulled from each retrieval channel before relevance filtering
VECTOR_CANDIDATES = 24
KEYWORD_CANDIDATES = 12
# Score boosts for sources the user attached to this session or that the graph links to the question
SESSION_SOURCE_BOOST = 0.08
GRAPH_SOURCE_BOOST = 0.06
KEYWORD_WEIGHT = 0.35

SUMMARY_HINTS = ("summar", "overview", "what is this", "tl;dr", "key point", "takeaway", "outline", "main idea")


def _message_text(message) -> str:
    content = message.content if hasattr(message, "content") else str(message)
    if isinstance(content, list):
        content = " ".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in content)
    return str(content).strip()


def _latest_user_text(messages) -> str:
    return _message_text(messages[-1]) if messages else ""


def _retrieval_query(messages) -> str:
    """Latest question, prefixed with the previous user question when it reads like a follow-up."""
    query = _latest_user_text(messages)
    if not query or len(query.split()) >= FOLLOW_UP_MAX_WORDS:
        return query
    previous = next((m for m in reversed(messages[:-1]) if isinstance(m, HumanMessage)), None)
    return f"{_message_text(previous)}\n{query}" if previous is not None else query


def _as_uuid(value) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
async def _graph_retrieval(query: str, user_id: str | None) -> tuple[dict, dict[str, list[str]]]:
    """Graph evidence plus {source_id: matched entities} for graph-linked documents."""
    empty = {"entities": [], "memories": []}
    if not user_id or not query:
        return empty, {}
    try:
        from app.graph.engine import graph_engine
    except Exception as e:
        print(f"Knowledge graph unavailable: {e}")
        return empty, {}
    if not graph_engine:
        return empty, {}

    # The Neo4j driver is synchronous; keep it off the event loop
    try:
        evidence = await asyncio.to_thread(graph_engine.get_graph_evidence, query, str(user_id))
    except Exception as e:
        print(f"Error querying knowledge graph evidence: {e}")
        evidence = empty
    try:
        linked = await asyncio.to_thread(graph_engine.get_related_sources_from_graph, query, str(user_id), 6)
    except Exception as e:
        print(f"Error checking related graph sources: {e}")
        linked = []
    graph_sources = {str(r["source_id"]): list(r.get("matched_entities") or []) for r in linked if r.get("source_id")}
    return evidence, graph_sources


def _chunk_from_row(row) -> dict:
    st_val = getattr(row, "source_type", "document")
    if hasattr(st_val, "value"):
        st_val = st_val.value
    similarity = getattr(row, "similarity", None)
    return {
        "id": str(row.id),
        "source_id": str(row.source_id),
        "source_title": getattr(row, "source_title", None) or "Document",
        "canonical_uri": getattr(row, "canonical_uri", None),
        "source_type": str(st_val or "document"),
        "chunk_index": row.chunk_index,
        "content": row.content,
        "similarity": float(similarity) if similarity is not None else 0.0,
    }


_CHUNK_COLUMNS = """
    sc.id, sc.source_id, sc.chunk_index, sc.content,
    CASE WHEN sc.embedding IS NULL THEN 0.0 ELSE 1 - (sc.embedding <=> :embedding) END AS similarity,
    s.title AS source_title, s.canonical_uri, s.source_type
"""


async def _library_candidates(
    db: AsyncSession,
    user_uuid: uuid.UUID,
    embedding: str,
    keywords: list[str],
    session_source_uuids: list[uuid.UUID],
    want_intro: bool,
) -> dict[str, dict]:
    """Semantic, keyword and (for summaries) intro-chunk candidates from the user's library, by chunk id."""
    candidates: dict[str, dict] = {}

    vector_rows = await db.execute(
        text(f"""
            SELECT {_CHUNK_COLUMNS}
            FROM source_chunks sc JOIN sources s ON sc.source_id = s.id
            WHERE s.user_id = :user_id AND sc.embedding IS NOT NULL
            ORDER BY sc.embedding <=> :embedding
            LIMIT :limit
        """),
        {"embedding": embedding, "user_id": user_uuid, "limit": VECTOR_CANDIDATES},
    )
    for row in vector_rows.fetchall():
        candidates[str(row.id)] = _chunk_from_row(row)

    # Exact-term matches the embedding may rank low (names, acronyms, identifiers)
    if keywords:
        patterns = [f"%{kw}%" for kw in keywords[:6]]
        keyword_rows = await db.execute(
            text(f"""
                SELECT {_CHUNK_COLUMNS}
                FROM source_chunks sc JOIN sources s ON sc.source_id = s.id
                WHERE s.user_id = :user_id
                  AND (sc.content ILIKE ANY(:patterns) OR s.title ILIKE ANY(:patterns))
                LIMIT :limit
            """),
            {"embedding": embedding, "user_id": user_uuid, "patterns": patterns, "limit": KEYWORD_CANDIDATES},
        )
        for row in keyword_rows.fetchall():
            candidates.setdefault(str(row.id), _chunk_from_row(row))

    # "Summarize this" questions need the opening of the attached sources, whatever the similarity
    if want_intro and session_source_uuids:
        intro_rows = await db.execute(
            text(f"""
                SELECT {_CHUNK_COLUMNS}
                FROM source_chunks sc JOIN sources s ON sc.source_id = s.id
                WHERE sc.source_id = ANY(:source_ids) AND s.user_id = :user_id AND sc.chunk_index IN (0, 1)
                ORDER BY sc.chunk_index ASC
            """),
            {"embedding": embedding, "user_id": user_uuid, "source_ids": session_source_uuids},
        )
        for row in intro_rows.fetchall():
            chunk = candidates.setdefault(str(row.id), _chunk_from_row(row))
            chunk["is_intro"] = True

    return candidates


def select_relevant_chunks(
    candidates: list[dict],
    keywords: list[str],
    session_source_ids: set[str],
    graph_sources: dict[str, list[str]],
) -> list[dict]:
    """Score, filter and diversify library chunks. Only relevant chunks survive, so an empty result
    means "the library doesn't cover this" and triggers the web fallback."""
    scored = []
    for chunk in candidates:
        sid = chunk["source_id"]
        overlap = keyword_overlap(keywords, f"{chunk.get('source_title', '')}\n{chunk.get('content', '')}")
        similarity = chunk.get("similarity", 0.0)
        in_session = sid in session_source_ids
        via_graph = sid in graph_sources

        is_relevant = (
            similarity >= settings.RAG_MIN_SIMILARITY
            or overlap >= settings.RAG_MIN_KEYWORD_OVERLAP
            or chunk.get("is_intro", False)
            # Attached and graph-linked sources get a slightly lower bar
            or ((in_session or via_graph) and similarity >= settings.RAG_MIN_SIMILARITY - 0.1)
        )
        if not is_relevant:
            continue

        score = similarity + KEYWORD_WEIGHT * overlap
        score += SESSION_SOURCE_BOOST if in_session else 0.0
        score += GRAPH_SOURCE_BOOST if via_graph else 0.0
        score += 1.0 if chunk.get("is_intro") else 0.0
        scored.append({
            **chunk,
            "score": round(score, 4),
            "keyword_overlap": round(overlap, 3),
            "retrieved_via": "session" if in_session else "graph" if via_graph else "library",
            "matched_entities": graph_sources.get(sid, []),
        })

    scored.sort(key=lambda c: c["score"], reverse=True)
    return _diversify(scored)


def _diversify(ranked: list[dict]) -> list[dict]:
    """Best-first chunks, capped per source and in total."""
    selected, per_source = [], {}
    for chunk in ranked:
        count = per_source.get(chunk["source_id"], 0)
        if count >= settings.RAG_MAX_CHUNKS_PER_SOURCE:
            continue
        per_source[chunk["source_id"]] = count + 1
        selected.append(chunk)
        if len(selected) >= settings.RAG_MAX_CHUNKS:
            break
    return selected


def merge_chunks(previous: list[dict], new: list[dict]) -> list[dict]:
    """Combine chunks from several retrieval attempts: dedupe by id (keeping the best score), re-rank, re-cap."""
    by_id = {c["id"]: c for c in previous}
    for chunk in new:
        kept = by_id.get(chunk["id"])
        if kept is None or chunk.get("score", 0.0) > kept.get("score", 0.0):
            by_id[chunk["id"]] = chunk
    return _diversify(sorted(by_id.values(), key=lambda c: c.get("score", 0.0), reverse=True))


def _search_query(state: ResearchChatState) -> str:
    """The rewritten query of a retry, else the question (with its context for short follow-ups)."""
    return state.get("search_query") or _retrieval_query(state.get("messages", []))


async def retrieve_node(state: ResearchChatState, config: RunnableConfig | None = None) -> dict:
    """Retrieve knowledge graph evidence, user memory, and relevant library chunks."""
    messages = state.get("messages", [])
    query = _search_query(state)
    if not query:
        return {"retrieved_chunks": [], "graph_evidence": {"entities": [], "memories": []}, "session_memories": []}

    user_id = state.get("user_id")
    keywords = extract_query_keywords(query)
    graph_evidence, graph_sources = await _graph_retrieval(query, user_id)

    db: AsyncSession | None = config.get("configurable", {}).get("db") if config else None
    user_uuid = _as_uuid(user_id)
    session_uuid = _as_uuid(state.get("session_id"))
    session_source_uuids = [u for u in (_as_uuid(s) for s in state.get("source_ids", [])) if u]

    retrieved_chunks: list[dict] = []
    retrieved_memories: list = []
    if db is not None and user_uuid is not None:
        try:
            embeddings = await generate_embeddings([query], user_id=str(user_id))
            embedding = "[" + ",".join(map(str, embeddings[0])) + "]" if embeddings else None

            from app.services.memory_service import retrieve_session_memories
            retrieved_memories = await retrieve_session_memories(
                db=db,
                session_id=session_uuid,
                query=query,
                user_id=user_uuid,
                query_embedding_str=embedding,
                limit=3,
            )

            if embedding:
                candidates = await _library_candidates(
                    db,
                    user_uuid,
                    embedding,
                    keywords,
                    session_source_uuids,
                    want_intro=any(hint in query.lower() for hint in SUMMARY_HINTS),
                )
                retrieved_chunks = select_relevant_chunks(
                    list(candidates.values()),
                    keywords,
                    {str(u) for u in session_source_uuids},
                    graph_sources,
                )
        except Exception as e:
            print(f"Error retrieving library chunks or memories: {e}")

    # On a retry, keep the evidence earlier attempts found
    if not graph_evidence.get("entities") and (state.get("graph_evidence") or {}).get("entities"):
        graph_evidence = state["graph_evidence"]
    return {
        "retrieved_chunks": merge_chunks(state.get("retrieved_chunks") or [], retrieved_chunks),
        "session_memories": retrieved_memories or state.get("session_memories") or [],
        "graph_evidence": graph_evidence,
        "searched": [*state.get("searched", []), {"source": "library", "query": query, "found": len(retrieved_chunks)}],
    }


async def web_search_node(state: ResearchChatState) -> dict:
    """Search the live web (Tavily) for the current question. Never returns placeholder results."""
    query = _search_query(state)
    if not query:
        return {"web_search_results": []}
    try:
        results = await WebSearchTool().search(
            query=query,
            max_results=settings.MAX_RESULTS_PER_SEARCH,
            allow_fallback=False,
            search_depth="advanced",
        )
    except Exception as e:
        print(f"Web search failed: {e}")
        results = []
    found = [r for r in results if r.get("url") and r.get("snippet")]

    # On a retry, keep earlier results and add only new pages
    previous = state.get("web_search_results") or []
    seen = {r["url"] for r in previous}
    merged = list(previous)
    for result in found:
        if result["url"] not in seen:
            seen.add(result["url"])
            merged.append(result)
    return {
        "web_search_results": merged,
        "searched": [*state.get("searched", []), {"source": "web", "query": query, "found": len(found)}],
    }


def should_search_web(state: ResearchChatState) -> str:
    """Search the web when asked to, or automatically when nothing in the library is relevant.
    "generate" means: go on to the evidence check, which leads to the answer."""
    if not WebSearchTool.is_configured():
        return "generate"
    if state.get("retrieval_attempts"):
        # A retry already chose its source; the evidence check decides whether to switch
        return "generate"
    if state.get("needs_web_search"):
        return "web_search"
    is_substantive = len(_latest_user_text(state.get("messages", [])).split()) >= AUTO_WEB_SEARCH_MIN_WORDS
    if is_substantive and not state.get("retrieved_chunks"):
        return "web_search"
    return "generate"


# ---------------------------------------------------------------------------
# Evidence check, query rewriting & source switching
# ---------------------------------------------------------------------------
GRADER_PROMPT = """You check whether retrieved evidence is enough to answer a research question, before the answer is written.

CONVERSATION (latest message last):
<<conversation>>

SEARCHES ALREADY RUN:
<<searches>>

EVIDENCE FOUND:
<<evidence>>

Judge only the evidence above, not your own knowledge. It is sufficient when it directly addresses the core of the latest message with specific facts. Evidence that is off-topic, only tangential, covers just a minor part of the question, or is clearly outdated for a question about recent developments is insufficient.

If it is insufficient, write one better search query: standalone (resolve pronouns and references from the conversation), specific, built on the key terms, names and likely synonyms, and different from the searches already run. Then choose where to run it:
- "library": the user's own documents and knowledge graph. Choose it when the evidence suggests the library covers the topic but the query missed it.
- "web": live web search. Choose it when the topic is general, recent, or evidently not in the library.

Reply with JSON only, no prose:
{"sufficient": true or false, "reason": "<one short sentence>", "query": "<rewritten query, or empty if sufficient>", "source": "library" or "web" or ""}"""

GRADER_EXCERPT_CHARS = 600
GRADER_MAX_SOURCES = 10
GRADER_HISTORY_MESSAGES = 4


def parse_verdict(text_reply: str) -> dict | None:
    """The grader's JSON verdict, or None when it can't be read (the answer then proceeds as is)."""
    match = re.search(r"\{.*\}", text_reply or "", re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("sufficient"), bool):
        return None
    source = data.get("source")
    return {
        "sufficient": data["sufficient"],
        "reason": str(data.get("reason") or "").strip()[:300],
        "query": str(data.get("query") or "").strip()[:300],
        "source": source if source in SEARCH_SOURCES else None,
    }


def _grader_input(state: ResearchChatState) -> str:
    messages = state.get("messages", [])[-GRADER_HISTORY_MESSAGES:]
    conversation = "\n".join(
        f"{'User' if isinstance(m, HumanMessage) else 'Assistant'}: {_message_text(m)[:800]}" for m in messages
    )
    searches = "\n".join(
        f"- {s['source']}: \"{s['query']}\" ({s.get('found', 0)} results)" for s in state.get("searched", [])
    ) or "- none"
    sources = build_numbered_sources(
        state.get("retrieved_chunks", []), state.get("graph_evidence") or {}, state.get("web_search_results", [])
    )
    evidence = "\n\n".join(
        _format_source_block(i, src)[:GRADER_EXCERPT_CHARS]
        for i, src in enumerate(sources[:GRADER_MAX_SOURCES], start=1)
    ) or "(nothing relevant was found)"
    return (
        GRADER_PROMPT.replace("<<conversation>>", conversation)
        .replace("<<searches>>", searches)
        .replace("<<evidence>>", evidence)
    )


def plan_retry(state: ResearchChatState, verdict: dict) -> tuple[str, str] | None:
    """(source, query) for the next search, or None when there is nothing new to try.
    Uses the grader's source when it gave one, else switches away from the last source searched,
    and never repeats a search that already ran."""
    searched = state.get("searched", [])
    query = verdict.get("query") or _retrieval_query(state.get("messages", []))
    if not query:
        return None
    last = searched[-1]["source"] if searched else "library"
    preferred = verdict.get("source") or ("web" if last == "library" else "library")
    alternative = "library" if preferred == "web" else "web"
    already_run = {(s["source"], s["query"].strip().lower()) for s in searched}
    for source in (preferred, alternative):
        if source == "web" and not WebSearchTool.is_configured():
            continue
        if (source, query.strip().lower()) not in already_run:
            return source, query
    return None


async def evaluate_evidence_node(state: ResearchChatState) -> dict:
    """Grade the evidence; when it falls short, rewrite the query and pick the source for another search."""
    proceed = {"next_source": None}
    attempts = state.get("retrieval_attempts", 0)
    question = _latest_user_text(state.get("messages", []))
    if (
        not settings.CHAT_EVIDENCE_GRADING
        or attempts >= settings.CHAT_MAX_RETRIEVAL_RETRIES
        or len(question.split()) < AUTO_WEB_SEARCH_MIN_WORDS
    ):
        return proceed

    try:
        enforce_pipeline_rate_limit(
            scope="pipeline:llm",
            limit=settings.PIPELINE_LLM_RPM,
            window=60,
            identifier=state.get("user_id"),
            description="Research chat evidence grading and query rewriting",
        )
        reply = await grader_llm.ainvoke(
            [HumanMessage(content=_grader_input(state))],
            config={"tags": [GRADER_TAG], "run_name": GRADER_TAG},
        )
        verdict = parse_verdict(_message_text(reply))
    except Exception as e:
        # The check is an optimisation: if it fails, answer from the evidence already found
        print(f"Evidence grading failed, answering with current evidence: {e}")
        return proceed

    if verdict is None or verdict["sufficient"]:
        return {**proceed, "evidence_verdict": verdict}
    plan = plan_retry(state, verdict)
    if plan is None:
        return {**proceed, "evidence_verdict": verdict}
    source, query = plan
    return {
        "evidence_verdict": verdict,
        "next_source": source,
        "search_query": query,
        "retrieval_attempts": attempts + 1,
    }


def route_after_evaluation(state: ResearchChatState) -> str:
    return {"library": "retrieve", "web": "web_search"}.get(state.get("next_source") or "", "generate")


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
RESEARCH_SYSTEM_PROMPT = """You are Scout, a research assistant. Treat every question as research: answer it accurately, ground it in evidence, and be explicit about what the evidence does and does not support.

THE EVIDENCE YOU GET
Numbered sources appear under RETRIEVED SOURCES. Each is labelled with its kind:
- LIBRARY: excerpts from documents, videos or repositories the user added. The strongest evidence.
- KNOWLEDGE GRAPH: entities and relationships extracted from the user's documents. Use it to connect ideas across sources and to name which documents discuss a concept; cite the underlying LIBRARY source as well when it is present.
- WEB: live web search results with their URL. Use them when the library doesn't cover the question, and prefer recent, primary, authoritative pages.

HOW TO ANSWER
1. Lead with the answer. Open with a direct one-to-three sentence answer before any elaboration.
2. Be precise and brief. Give the shortest answer that fully and accurately answers the question: every sentence must carry evidence, reasoning or a conclusion the user needs. Most answers fit in 5-40 lines; go longer only when the question truly demands it, and never exceed {max_lines} lines. Drop preambles, restated questions, generic caveats, filler transitions and closing summaries that repeat earlier points.
3. Reason before concluding. For analytical or comparative questions, work through what each source establishes, where sources agree or conflict, and what follows, then state a clear conclusion. Use a few short headed sections only when they genuinely aid scanning; a simple or conversational message gets a plain short reply.
4. Cite every evidence-backed claim with its source number, e.g. [1] or [2][3], placed right after the claim. Only cite numbers that exist below, only for claims those sources support, and never cite a source you did not use.
5. Keep evidence and background knowledge separate. You may use general knowledge to explain concepts or fill gaps, but never put a citation on it. When an important point is not covered by the sources, say so plainly (for example: "Your library doesn't address X; in general, ...").
6. Be honest about conflicts and gaps. If sources disagree, present each position with its citation and say which is better supported and why. If evidence is thin, dated, or missing, state what is missing instead of guessing. Never invent sources, statistics, quotes, or URLs.
7. Build on what came before. Use the conversation so far and the user context when relevant; don't repeat what has already been established unless asked.
8. Format for scanning. Markdown with short paragraphs, bullet lists, and a compact table when comparing several items. Use fenced code blocks only for real code, commands or data. Never draw ASCII art, box-drawing or text-based diagrams, flowcharts or decorative separators; describe structure in words or a list instead.
9. Do not write your own references or bibliography section, and do not add follow-up question lists; both are appended automatically."""

RESEARCH_SYSTEM_PROMPT = RESEARCH_SYSTEM_PROMPT.replace("{max_lines}", str(settings.CHAT_MAX_ANSWER_LINES))

NO_CONTEXT_NOTE = (
    "\n\nNo library sources, knowledge graph facts, or web results were found for this message. Answer from general "
    "knowledge without any citation markers. If the question is substantive, add one short line noting that adding "
    "sources or enabling web search would allow a cited answer."
)

WEB_FALLBACK_NOTE = (
    "\n\nNothing in the user's library was relevant to this question, so web results were retrieved instead. "
    "Say so in one short clause at the start (e.g. \"Your library doesn't cover this, so this answer draws on web sources.\")."
)

RETRY_NOTE = (
    "\n\nThe first search did not find enough evidence, so the query was rewritten and searched again. Searches run: "
    "<<searches>>. The sources above combine every search. If they still don't fully answer the question, "
    "say plainly what is missing rather than filling the gap with uncited claims."
)

KIND_LABEL = {"library": "LIBRARY", "graph": "KNOWLEDGE GRAPH", "web": "WEB"}


def build_numbered_sources(chunks: list[dict], graph_evidence: dict | None, web_results: list[dict]) -> list[dict]:
    """Library sources first (grouped by document), then the knowledge graph, then web results."""
    sources_map: dict[str, dict] = {}
    for chunk in chunks:
        sid = str(chunk.get("source_id") or chunk.get("source_title", "Document"))
        if sid not in sources_map:
            sources_map[sid] = {
                "kind": "library",
                "source_id": chunk.get("source_id"),
                "source_title": chunk.get("source_title", "Document"),
                "canonical_uri": chunk.get("canonical_uri"),
                "source_type": chunk.get("source_type", "document"),
                "retrieved_via": chunk.get("retrieved_via", "library"),
                "matched_entities": chunk.get("matched_entities", []),
                "chunks": [],
            }
        sources_map[sid]["chunks"].append(chunk)
    sources = list(sources_map.values())

    graph_facts = format_graph_facts(graph_evidence or {})
    if graph_facts:
        labels = [e["label"] for e in (graph_evidence or {}).get("entities", [])[:3]]
        sources.append({
            "kind": "graph",
            "source_id": None,
            "source_title": "Knowledge graph: " + ", ".join(labels),
            "canonical_uri": None,
            "source_type": "graph",
            "retrieved_via": "graph",
            "matched_entities": labels,
            "chunks": [{"content": graph_facts, "chunk_index": 0}],
        })

    for result in web_results:
        sources.append({
            "kind": "web",
            "source_id": None,
            "source_title": result.get("title") or "Web result",
            "canonical_uri": result.get("url"),
            "source_type": "web",
            "retrieved_via": "web",
            "matched_entities": [],
            "chunks": [{"content": (result.get("snippet") or "")[:1500], "chunk_index": 0}],
        })
    return sources


def _format_source_block(index: int, src: dict) -> str:
    header = f"[{index}] {KIND_LABEL[src['kind']]} · {src.get('source_title') or f'Source {index}'}"
    if src.get("canonical_uri"):
        header += f" · {src['canonical_uri']}"
    if src["kind"] == "library" and src.get("matched_entities"):
        header += f" · linked via graph concepts: {', '.join(src['matched_entities'][:4])}"
    excerpts = [ch.get("content", "").strip() for ch in src["chunks"][:3] if ch.get("content")]
    return header + "\n" + "\n\n".join(excerpts)


async def generate_node(state: ResearchChatState) -> dict:
    """Generate the final, cited response from library, graph and web evidence."""
    messages = state.get("messages", [])
    chunks = state.get("retrieved_chunks", [])
    web_results = state.get("web_search_results", [])
    graph_evidence = state.get("graph_evidence") or {}
    session_memories = state.get("session_memories", [])
    user_id = state.get("user_id")

    sources_list = build_numbered_sources(chunks, graph_evidence, web_results)

    context_sections = []
    user_context = [f"- {m}" for m in graph_evidence.get("memories", [])]
    user_context += [f"- {m.get('content')}" for m in session_memories if m.get("content")]
    if user_context:
        context_sections.append("=== USER CONTEXT (interests and past session insights; not citable) ===\n" + "\n".join(user_context))
    if sources_list:
        blocks = [_format_source_block(i, src) for i, src in enumerate(sources_list, start=1)]
        context_sections.append("=== RETRIEVED SOURCES ===\n" + "\n\n---\n\n".join(blocks))

    system_prompt = RESEARCH_SYSTEM_PROMPT
    if sources_list:
        system_prompt += "\n\nPROVIDED CONTEXT:\n" + "\n\n".join(context_sections)
        if web_results and not chunks:
            system_prompt += WEB_FALLBACK_NOTE
        if state.get("retrieval_attempts"):
            searches = "; ".join(f"{s['source']} \"{s['query']}\"" for s in state.get("searched", []))
            system_prompt += RETRY_NOTE.replace("<<searches>>", searches)
    else:
        if context_sections:
            system_prompt += "\n\nPROVIDED CONTEXT:\n" + "\n\n".join(context_sections)
        system_prompt += NO_CONTEXT_NOTE

    # System prompt + recent conversation (chat_service already caps the history length)
    llm_messages = [SystemMessage(content=system_prompt)]
    llm_messages.extend(messages)

    enforce_pipeline_rate_limit(
        scope="pipeline:llm",
        limit=settings.PIPELINE_LLM_RPM,
        window=60,
        identifier=user_id,
        description="LangGraph research assistant synthesis LLM invocation",
    )

    response = await llm.ainvoke(llm_messages)
    response_text = _message_text(response)

    # Keep only sources the answer actually cites (by number, or by naming a library source)
    cited_nums = {int(m) for m in re.findall(r"\[(\d+)\]", response_text)}
    lowered = response_text.lower()
    actual_citations = []
    for i, src in enumerate(sources_list, start=1):
        title_lower = (src.get("source_title") or "").lower()
        named = src["kind"] == "library" and len(title_lower) > 4 and title_lower in lowered
        if i not in cited_nums and not named:
            continue
        first_chunk = src["chunks"][0] if src["chunks"] else {}
        snippet = " ... ".join(c.get("content", "").strip() for c in src["chunks"][:2] if c.get("content"))
        actual_citations.append({
            "citation_index": i,
            "source_id": src.get("source_id"),
            "source_title": src.get("source_title", f"Source {i}"),
            "canonical_uri": src.get("canonical_uri"),
            "source_type": src.get("source_type", "document"),
            "retrieved_via": src.get("retrieved_via"),
            "matched_entities": src.get("matched_entities", []),
            "content": snippet[:300] or first_chunk.get("content", "")[:300],
            "chunk_index": first_chunk.get("chunk_index", 0),
        })

    return {"messages": [response], "citations": actual_citations}
