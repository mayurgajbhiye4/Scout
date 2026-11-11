"""LangGraph nodes for Research Chat.

Retrieval pipeline per question:
  1. Knowledge graph (Neo4j): entities matching the question in the user's own documents, their
     related entities, and the documents linked to them.
  2. Library RAG (pgvector): semantic + keyword candidates across the user's library, boosted when
     the source is attached to the session or linked through the graph, then filtered by relevance.
  3. Evidence check (agentic corrective RAG): an LLM grades what was found, sets aside off-topic sources,
     and either answers or picks the next search (library or web) with up to CHAT_MAX_SEARCH_QUERIES
     queries of its own, up to CHAT_MAX_RETRIEVAL_RETRIES times. Code keeps the guardrails: the budget,
     no repeated searches, and the web only when it is configured.
  4. Web (Tavily): searched when the grader picks it, and once more as a top-up when the budget runs out
     and the web hasn't been searched yet. Also runs up front when the user asks for it.
Every piece of evidence becomes a numbered source the answer must cite.
"""
import asyncio
import json
import re
import uuid

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.state import ResearchChatState
from app.core.config import settings
from app.core.rate_limit import enforce_pipeline_rate_limit
from app.retrieval.graph_facts import format_graph_facts
from app.retrieval.keywords import extract_query_keywords, idf_weights, keyword_overlap, keyword_pattern
from app.services.embedding_service import EmbeddingUnavailable, generate_embeddings
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

# Follow-ups shorter than this are retrieved together with the previous question,
# so "what about its limitations?" still finds the right sources.
FOLLOW_UP_MAX_WORDS = 12
# Below this, a message is treated as conversational and never triggers an automatic web search.
AUTO_WEB_SEARCH_MIN_WORDS = 4
# Candidates pulled from each retrieval channel before relevance filtering
VECTOR_CANDIDATES = 24
KEYWORD_CANDIDATES = 12
# Score boosts for sources the user attached to this session or that the graph links to the question
SESSION_SIMILARITY_MARGIN = 0.05
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


def _question(state: ResearchChatState) -> str:
    """This turn's message, without earlier unanswered messages merged into the same conversation turn."""
    return (state.get("question") or "").strip() or _latest_user_text(state.get("messages", []))


def _retrieval_query(messages, question: str | None = None) -> str:
    """Latest question, prefixed with the previous user question when it reads like a follow-up."""
    query = (question or "").strip() or _latest_user_text(messages)
    if not query or len(query.split()) >= FOLLOW_UP_MAX_WORDS:
        return query
    previous = next((m for m in reversed(messages[:-1]) if isinstance(m, HumanMessage)), None)
    if previous is None or len(_message_text(previous).split()) < AUTO_WEB_SEARCH_MIN_WORDS:
        return query  # Small talk like "hi" gives a follow-up no useful context
    return f"{_message_text(previous)}\n{query}"


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

    # Exact-term matches the embedding may rank low (names, acronyms, identifiers), most terms matched first
    if keywords:
        patterns = [f"%{kw}%" for kw in keywords[:6]]
        keyword_rows = await db.execute(
            text(f"""
                SELECT {_CHUNK_COLUMNS}
                FROM source_chunks sc JOIN sources s ON sc.source_id = s.id
                WHERE s.user_id = :user_id
                  AND (sc.content ILIKE ANY(CAST(:patterns AS text[])) OR s.title ILIKE ANY(CAST(:patterns AS text[])))
                ORDER BY (
                    SELECT count(*) FROM unnest(CAST(:patterns AS text[])) AS pattern
                    WHERE sc.content ILIKE pattern OR s.title ILIKE pattern
                ) DESC
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


async def _keyword_weights(db: AsyncSession, user_uuid: uuid.UUID, keywords: list[str]) -> dict[str, float]:
    """IDF weight of each keyword across the user's library chunks."""
    if not keywords:
        return {}
    rows = await db.execute(
        text("""
            SELECT p.i, count(sc.id) AS df
            FROM unnest(CAST(:patterns AS text[])) WITH ORDINALITY AS p(pattern, i)
            LEFT JOIN (source_chunks sc JOIN sources s ON sc.source_id = s.id AND s.user_id = :user_id)
              ON sc.content ~* p.pattern OR s.title ~* p.pattern
            GROUP BY p.i
        """),
        {"patterns": [keyword_pattern(kw) for kw in keywords], "user_id": user_uuid},
    )
    doc_freq = {keywords[int(row.i) - 1]: int(row.df) for row in rows.fetchall()}
    total = await db.execute(
        text("SELECT count(*) FROM source_chunks sc JOIN sources s ON sc.source_id = s.id WHERE s.user_id = :user_id"),
        {"user_id": user_uuid},
    )
    return idf_weights(doc_freq, int(total.scalar() or 0))


def _is_relevant(chunk: dict, similarity: float, coverage: float, has_keywords: bool, in_session: bool) -> bool:
    if chunk.get("is_intro", False):
        return True
    # Sources attached to this session get a slightly lower bar
    if in_session and similarity >= settings.RAG_MIN_SIMILARITY - SESSION_SIMILARITY_MARGIN:
        return True
    if similarity >= settings.RAG_STRONG_SIMILARITY or coverage >= settings.RAG_MIN_KEYWORD_OVERLAP:
        return True
    # In between, closeness alone is noise: the chunk must also contain the question's distinctive terms
    return similarity >= settings.RAG_MIN_SIMILARITY and (
        not has_keywords or coverage >= settings.RAG_MIN_BAND_COVERAGE
    )


def select_relevant_chunks(
    candidates: list[dict],
    keywords: list[str],
    session_source_ids: set[str],
    graph_sources: dict[str, list[str]],
    keyword_weights: dict[str, float] | None = None,
) -> list[dict]:
    """Score, filter and diversify library chunks. Only relevant chunks survive, so an empty result
    means "the library doesn't cover this" and triggers the web fallback."""
    scored = []
    for chunk in candidates:
        sid = chunk["source_id"]
        overlap = keyword_overlap(
            keywords, f"{chunk.get('source_title', '')}\n{chunk.get('content', '')}", keyword_weights
        )
        similarity = chunk.get("similarity", 0.0)
        in_session = sid in session_source_ids
        via_graph = sid in graph_sources

        if not _is_relevant(chunk, similarity, overlap, bool(keywords), in_session):
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


def _source_key(chunk: dict) -> str:
    """The library source a chunk belongs to, as numbered sources group it."""
    return str(chunk.get("source_id") or chunk.get("source_title", "Document"))


def merge_chunks(previous: list[dict], new: list[dict], rejected=()) -> list[dict]:
    """Combine chunks from several retrieval attempts: dedupe by id (keeping the best score), re-rank, re-cap.
    Chunks of sources the evidence check set aside stay out."""
    rejected = set(rejected)
    by_id = {c["id"]: c for c in previous}
    for chunk in new:
        if _source_key(chunk) in rejected:
            continue
        kept = by_id.get(chunk["id"])
        if kept is None or chunk.get("score", 0.0) > kept.get("score", 0.0):
            by_id[chunk["id"]] = chunk
    return _diversify(sorted(by_id.values(), key=lambda c: c.get("score", 0.0), reverse=True))


def _search_queries(state: ResearchChatState) -> list[str]:
    """The queries the evidence check planned for a retry, else the question (with its context for
    short follow-ups)."""
    planned = [q for q in (state.get("search_queries") or []) if q and q.strip()]
    if planned:
        return planned
    query = state.get("search_query") or _retrieval_query(state.get("messages", []), state.get("question"))
    return [query] if query else []


def _search_query(state: ResearchChatState) -> str:
    """The first query of the next search."""
    queries = _search_queries(state)
    return queries[0] if queries else ""


async def _library_search(
    db: AsyncSession,
    user_uuid: uuid.UUID,
    query: str,
    embedding: str,
    session_source_uuids: list[uuid.UUID],
    graph_sources: dict[str, list[str]],
) -> list[dict]:
    """Relevant library chunks for one query."""
    keywords = extract_query_keywords(query)
    candidates = await _library_candidates(
        db,
        user_uuid,
        embedding,
        keywords,
        session_source_uuids,
        want_intro=any(hint in query.lower() for hint in SUMMARY_HINTS),
    )
    return select_relevant_chunks(
        list(candidates.values()),
        keywords,
        {str(u) for u in session_source_uuids},
        graph_sources,
        await _keyword_weights(db, user_uuid, keywords),
    )


async def retrieve_node(state: ResearchChatState, config: RunnableConfig | None = None) -> dict:
    """Retrieve knowledge graph evidence, user memory, and relevant library chunks for each planned query."""
    queries = _search_queries(state)
    if not queries:
        return {"retrieved_chunks": [], "graph_evidence": {"entities": [], "memories": []}, "session_memories": []}

    user_id = state.get("user_id")
    db: AsyncSession | None = config.get("configurable", {}).get("db") if config else None
    user_uuid = _as_uuid(user_id)
    session_uuid = _as_uuid(state.get("session_id"))
    session_source_uuids = [u for u in (_as_uuid(s) for s in state.get("source_ids", [])) if u]
    rejected = state.get("rejected") or []

    graph_evidence: dict = {"entities": [], "memories": []}
    graph_by_query = []
    for query in queries:
        evidence, graph_sources = await _graph_retrieval(query, user_id)
        if not graph_evidence.get("entities"):
            graph_evidence = evidence
        graph_by_query.append(graph_sources)

    chunks = state.get("retrieved_chunks") or []
    found = [0] * len(queries)
    retrieved_memories: list = []
    if db is not None and user_uuid is not None:
        try:
            try:
                vectors = await generate_embeddings(queries, user_id=str(user_id))
                embeddings = ["[" + ",".join(map(str, v)) + "]" for v in vectors]
            except EmbeddingUnavailable as e:
                # Stored vectors are Gemini's, so there's no meaningful library search; the web fallback answers
                print(f"Embedding model unavailable, skipping library search: {e}")
                embeddings = []

            if embeddings:
                from app.services.memory_service import retrieve_session_memories
                retrieved_memories = await retrieve_session_memories(
                    db=db,
                    session_id=session_uuid,
                    query=queries[0],
                    user_id=user_uuid,
                    query_embedding_str=embeddings[0],
                    limit=3,
                )
            # One session, so the queries run one after another
            for i, (query, embedding) in enumerate(zip(queries, embeddings)):
                new = await _library_search(db, user_uuid, query, embedding, session_source_uuids, graph_by_query[i])
                new = [c for c in new if _source_key(c) not in set(rejected)]
                found[i] = len(new)
                chunks = merge_chunks(chunks, new, rejected)
        except Exception as e:
            print(f"Error retrieving library chunks or memories: {e}")

    # On a retry, keep the evidence earlier attempts found
    if not graph_evidence.get("entities") and (state.get("graph_evidence") or {}).get("entities"):
        graph_evidence = state["graph_evidence"]
    return {
        "retrieved_chunks": chunks,
        "session_memories": retrieved_memories or state.get("session_memories") or [],
        "graph_evidence": graph_evidence,
        "searched": [
            *state.get("searched", []),
            *({"source": "library", "query": q, "found": n} for q, n in zip(queries, found)),
        ],
    }


async def _web_search(query: str) -> list[dict]:
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
    return [r for r in results if r.get("url") and r.get("snippet")]


async def web_search_node(state: ResearchChatState) -> dict:
    """Search the live web (Tavily) for each planned query. Never returns placeholder results."""
    queries = _search_queries(state)
    if not queries:
        return {"web_search_results": []}
    found_per_query = await asyncio.gather(*(_web_search(q) for q in queries))

    # On a retry, keep earlier results and add only new pages (never ones the evidence check set aside)
    previous = state.get("web_search_results") or []
    seen = {r["url"] for r in previous} | set(state.get("rejected") or [])
    merged = list(previous)
    for found in found_per_query:
        for result in found:
            if result["url"] not in seen:
                seen.add(result["url"])
                merged.append(result)
    return {
        "web_search_results": merged,
        "searched": [
            *state.get("searched", []),
            *({"source": "web", "query": q, "found": len(f)} for q, f in zip(queries, found_per_query)),
        ],
    }


def should_search_web(state: ResearchChatState) -> str:
    """Search the web up front only when the user asked to; otherwise the evidence check decides.
    "generate" means: go on to the evidence check, which leads to the answer."""
    if WebSearchTool.is_configured() and state.get("needs_web_search") and not state.get("retrieval_attempts"):
        return "web_search"
    return "generate"


# ---------------------------------------------------------------------------
# Evidence check, query rewriting & source switching
# ---------------------------------------------------------------------------
GRADER_PROMPT = """You are the evidence check of a research assistant. Before the answer is written, you judge the retrieved evidence and decide what happens next.

CONVERSATION (latest message last):
<<conversation>>

SEARCHES ALREADY RUN:
<<searches>>

EVIDENCE FOUND (numbered sources):
<<evidence>>

SEARCH TOOLS YOU CAN USE NEXT:
<<tools>>

1. Judge only the evidence above, not your own knowledge. It is sufficient when a grounded, useful answer to the core of the latest message can be written from it with specific facts. The answer may synthesize across sources: the evidence need not state the answer verbatim, use the question's wording, match a requested format such as a "top 5" list, or cover every detail. Evidence that is off-topic, only tangential, covers just a minor part of the question, or is clearly outdated for a question about recent developments is insufficient.
2. List in "drop" the numbers of LIBRARY or WEB sources that are off-topic for the question and would only add noise to the answer. Never drop a source that is even partly relevant, and never drop the KNOWLEDGE GRAPH source.
3. Choose the next action:
   - "answer": the evidence is sufficient, or no search could plausibly find better evidence.
   - "library": the user's own documents probably cover what's missing (their papers, notes, videos, repositories).
   - "web": what's missing is recent, public or general information the user's documents are unlikely to hold.
   Only choose a tool listed above.
4. For "library" or "web", write 1 to <<max_queries>> search queries for that tool: standalone (resolve pronouns and references from the conversation), specific, built on key terms, names and likely synonyms, and different from the searches already run. Use several queries only when the question has distinct parts; otherwise one.

Reply with JSON only, no prose:
{"sufficient": true or false, "reason": "<one short sentence>", "action": "answer" | "library" | "web", "queries": ["<query>", ...], "drop": [<source numbers>]}"""

# Roomy enough for every excerpt of a source: the grader can't judge evidence it isn't shown
GRADER_SOURCE_CHARS = 4000
GRADER_MAX_SOURCES = 10
GRADER_HISTORY_MESSAGES = 4
ACTIONS = ("answer", "library", "web")
TOOL_NOTES = {
    "library": "- library: the user's own documents and knowledge graph",
    "web": "- web: live web search",
}


def _clean_queries(raw) -> list[str]:
    """Non-empty, case-insensitively unique queries, capped at CHAT_MAX_SEARCH_QUERIES."""
    queries: list[str] = []
    for q in raw:
        q = str(q or "").strip()[:300]
        if q and q.lower() not in {x.lower() for x in queries}:
            queries.append(q)
    return queries[: settings.CHAT_MAX_SEARCH_QUERIES]


def _source_numbers(raw) -> list[int]:
    numbers = set()
    for n in raw if isinstance(raw, list) else []:
        try:
            numbers.add(int(n))
        except (TypeError, ValueError):
            continue
    return sorted(numbers)


def parse_verdict(text_reply: str) -> dict | None:
    """The grader's JSON verdict, or None when it can't be read (the answer then proceeds as is).
    A reply without an action (the older format) reads as: insufficient -> search the library."""
    match = re.search(r"\{.*\}", text_reply or "", re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("sufficient"), bool):
        return None

    raw_queries = data.get("queries") if isinstance(data.get("queries"), list) else []
    if data.get("query"):
        raw_queries = [*raw_queries, data["query"]]
    action = str(data.get("action") or "").strip().lower()
    if data["sufficient"]:
        action = "answer"
    elif action not in ACTIONS:
        action = "library"
    return {
        "sufficient": data["sufficient"],
        "reason": str(data.get("reason") or "").strip()[:300],
        "action": action,
        "queries": _clean_queries(raw_queries),
        "drop": _source_numbers(data.get("drop")),
    }


def _available_tools() -> list[str]:
    return ["library", "web"] if WebSearchTool.is_configured() else ["library"]


def _grader_sources(state: ResearchChatState) -> list[dict]:
    """The numbered sources the grader is shown; its "drop" numbers index into this list."""
    return build_numbered_sources(
        state.get("retrieved_chunks", []), state.get("graph_evidence") or {}, state.get("web_search_results", [])
    )[:GRADER_MAX_SOURCES]


def _grader_input(state: ResearchChatState) -> str:
    messages = state.get("messages", [])[-GRADER_HISTORY_MESSAGES:]
    conversation = "\n".join(
        f"{'User' if isinstance(m, HumanMessage) else 'Assistant'}: {_message_text(m)[:800]}" for m in messages
    )
    searches = "\n".join(
        f"- {s['source']}: \"{s['query']}\" ({s.get('found', 0)} results)" for s in state.get("searched", [])
    ) or "- none"
    evidence = "\n\n".join(
        _format_source_block(i, src)[:GRADER_SOURCE_CHARS]
        for i, src in enumerate(_grader_sources(state), start=1)
    ) or "(nothing relevant was found)"
    return (
        GRADER_PROMPT.replace("<<conversation>>", conversation)
        .replace("<<searches>>", searches)
        .replace("<<evidence>>", evidence)
        .replace("<<tools>>", "\n".join(TOOL_NOTES[t] for t in _available_tools()))
        .replace("<<max_queries>>", str(settings.CHAT_MAX_SEARCH_QUERIES))
    )


def plan_queries(state: ResearchChatState, verdict: dict, source: str) -> list[str]:
    """The grader's queries for `source` that haven't run there yet (the question itself when it wrote none)."""
    planned = verdict.get("queries") or [_retrieval_query(state.get("messages", []), state.get("question"))]
    already_run = {s["query"].strip().lower() for s in state.get("searched", []) if s["source"] == source}
    return _clean_queries(q for q in planned if (q or "").strip().lower() not in already_run)


def refine_evidence(state: ResearchChatState, drop: list[int]) -> dict:
    """Knowledge refinement: remove the library sources and web pages the grader marked off-topic.
    Returns the state update ({} when nothing is dropped)."""
    sources = _grader_sources(state)
    keys = set()
    for n in drop:
        if not 1 <= n <= len(sources):
            continue
        src = sources[n - 1]
        if src["kind"] == "library" and src["chunks"]:
            keys.add(_source_key(src["chunks"][0]))
        elif src["kind"] == "web" and src.get("canonical_uri"):
            keys.add(src["canonical_uri"])
    if not keys:
        return {}
    earlier = state.get("rejected") or []
    return {
        "retrieved_chunks": [c for c in state.get("retrieved_chunks", []) if _source_key(c) not in keys],
        "web_search_results": [r for r in state.get("web_search_results", []) if r.get("url") not in keys],
        "rejected": [*earlier, *sorted(keys - set(earlier))],
    }


def _has_evidence(state: ResearchChatState) -> bool:
    return bool(
        state.get("retrieved_chunks") or state.get("web_search_results")
        or format_graph_facts(state.get("graph_evidence") or {})
    )


def _web_already_searched(state: ResearchChatState) -> bool:
    return any(s["source"] == "web" for s in state.get("searched", []))


def _web_fallback(state: ResearchChatState) -> dict:
    """The last step when no planned search is left: one web search, unless it already ran or isn't available."""
    use_web = WebSearchTool.is_configured() and not _web_already_searched(state)
    return {"next_source": "web" if use_web else None, "search_queries": [], "search_query": None}


def next_search(state: ResearchChatState, verdict: dict) -> dict:
    """The grader's chosen search, within the guardrails: only available tools, never a repeated query.
    When the chosen tool has nothing new to run, the other one is tried; {} means answer now."""
    if verdict["action"] == "answer":
        return {}
    tools = _available_tools()
    order = [verdict["action"], *(t for t in ("library", "web") if t != verdict["action"])]
    for source in (t for t in order if t in tools):
        queries = plan_queries(state, verdict, source)
        if queries:
            return {"next_source": source, "search_queries": queries, "search_query": queries[0]}
    return {}


async def evaluate_evidence_node(state: ResearchChatState) -> dict:
    """Grade the evidence, set aside off-topic sources, then answer or run the search the grader picks."""
    proceed = {"next_source": None, "search_queries": [], "search_query": None}
    attempts = state.get("retrieval_attempts", 0)
    if len(_question(state).split()) < AUTO_WEB_SEARCH_MIN_WORDS:
        return proceed
    first_pass_hit = attempts == 0 and bool(state.get("retrieved_chunks"))
    if not settings.CHAT_EVIDENCE_GRADING:
        return proceed if first_pass_hit else _web_fallback(state)
    if first_pass_hit and not settings.CHAT_GRADE_FIRST_PASS:
        return proceed
    if attempts >= settings.CHAT_MAX_RETRIEVAL_RETRIES:
        return _web_fallback(state)

    try:
        enforce_pipeline_rate_limit(
            scope="pipeline:llm",
            limit=settings.PIPELINE_LLM_RPM,
            window=60,
            identifier=state.get("user_id"),
            description="Research chat evidence grading and search planning",
        )
        reply = await grader_llm.ainvoke(
            [HumanMessage(content=_grader_input(state))],
            config={"tags": [GRADER_TAG], "run_name": GRADER_TAG},
        )
        verdict = parse_verdict(_message_text(reply))
    except Exception as e:
        # Without a verdict there is no planned search, so go on to the web
        print(f"Evidence grading failed, skipping the planned search: {e}")
        return _web_fallback(state)
    if verdict is None:
        return _web_fallback(state)

    refined = refine_evidence(state, verdict["drop"])
    if refined and verdict["sufficient"] and not _has_evidence({**state, **refined}):
        refined = {}  # Contradictory verdict: "sufficient" yet every source dropped. Keep the evidence.
    update = {**refined, "evidence_verdict": verdict}

    planned = next_search({**state, **refined}, verdict)
    if not planned:
        return {**proceed, **update}
    return {**update, **planned, "retrieval_attempts": attempts + 1}


def route_after_evaluation(state: ResearchChatState) -> str:
    return {"library": "retrieve", "web": "web_search"}.get(state.get("next_source") or "", "generate")


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
RESEARCH_SYSTEM_PROMPT = """You are Scout, a research assistant. Answer every question accurately, grounded in the evidence, as precisely and briefly as possible.

THE EVIDENCE YOU GET
Numbered sources appear under RETRIEVED SOURCES. Each is labelled with its kind:
- LIBRARY: excerpts from documents, videos or repositories the user added. The strongest evidence.
- KNOWLEDGE GRAPH: entities and relationships extracted from the user's documents. Use it to connect ideas across sources; cite the underlying LIBRARY source as well when it is present.
- WEB: live web search results with their URL. Prefer recent, primary, authoritative pages.

ANSWER FORMAT (follow exactly)
1. One paragraph: the synthesized answer in 2-4 sentences, leading with the direct answer. Every sentence must carry a fact, a reason or a conclusion. No preamble, no restating the question, no hedging filler, no closing summary.
2. Then 2-5 bullet points, each a single line of at most 20 words, each adding one distinct key fact, step, mechanism or distinction the paragraph didn't spell out. Skip the bullets when the paragraph already says everything (a simple fact, a conversational message).
3. Nothing else: no headings, no tables, no bold labels, no notes or disclaimers about which sources were or weren't used, no references or bibliography. Use a fenced code block only when the user asks for code or commands. Never draw ASCII art or text diagrams.

EVIDENCE RULES
- Cite every evidence-backed claim with its source number right after it, e.g. [1] or [2][3]. Only cite numbers that exist below, only for claims they support.
- General knowledge may explain or fill gaps, but never carries a citation.
- If sources conflict, say so in one clause with both citations. If the evidence can't answer part of the question, state what's missing in one short bullet. Never invent sources, statistics, quotes or URLs.
- Build on the conversation so far; don't repeat what was already established.

FOLLOW-UP QUESTIONS
After the answer, write a line containing only <<follow_ups_marker>>, then up to <<follow_ups_count>> follow-up questions, one per line, with no numbering or bullets:
- one line each, at most 12 words, ending with "?"
- a deep, specific question that digs into an idea, method, claim, assumption or limitation from the sources the answer used, not a generic one
- never write a source's title; say "the paper", "the video", "this repo", "the article", or name the concept itself
- nothing the answer already covers
For small talk, write no marker and no questions."""

FOLLOW_UPS_MARKER = "@@FOLLOW_UPS@@"
MAX_FOLLOW_UP_CHARS = 110

RESEARCH_SYSTEM_PROMPT = (
    RESEARCH_SYSTEM_PROMPT
    .replace("<<follow_ups_marker>>", FOLLOW_UPS_MARKER)
    .replace("<<follow_ups_count>>", str(settings.CHAT_SUGGESTION_COUNT))
)


def split_follow_ups(text: str, limit: int | None = None) -> tuple[str, list[str]]:
    """Separate the answer from the follow-up questions the model writes after FOLLOW_UPS_MARKER."""
    at = text.find(FOLLOW_UPS_MARKER)
    if at < 0:
        return text.rstrip(), []
    answer, tail = text[:at].rstrip(), text[at + len(FOLLOW_UPS_MARKER):]
    limit = settings.CHAT_SUGGESTION_COUNT if limit is None else limit
    questions: list[str] = []
    seen: set[str] = set()
    for line in tail.splitlines():
        q = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line)
        q = " ".join(q.strip().strip("\"'“”*_").split())
        if not q or len(q) > MAX_FOLLOW_UP_CHARS or q.lower() in seen:
            continue
        seen.add(q.lower())
        questions.append(q)
        if len(questions) >= limit:
            break
    return answer, questions


NO_CONTEXT_NOTE = (
    "\n\nNo library sources, knowledge graph facts, or web results were found for this message. Answer from general "
    "knowledge in the same format, without any citation markers."
)

WEB_TOP_UP_NOTE = (
    "\n\nBoth LIBRARY and WEB sources are provided. Write one combined answer: build on the library sources and use "
    "the web sources to fill what they leave out, citing each claim to the source it came from."
)

RETRY_NOTE = (
    "\n\nThe first search did not find enough evidence, so the query was rewritten and searched again. Searches run: "
    "<<searches>>. The sources above combine every search. If they still don't fully answer the question, "
    "state what is missing in one short bullet rather than filling the gap with uncited claims."
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
        if web_results and chunks:
            system_prompt += WEB_TOP_UP_NOTE
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
    response_text, follow_ups = split_follow_ups(_message_text(response))

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

    return {"messages": [AIMessage(content=response_text)], "citations": actual_citations, "follow_ups": follow_ups}
