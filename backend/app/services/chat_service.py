"""Chat service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import re
import uuid
import json
from urllib.parse import urlparse
from typing import AsyncGenerator, List
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from app.db.models.chat_message import ChatMessage, MessageRole, MessageStatus
from app.db.models.message_citation import MessageCitation
from app.db.models.session_source import SessionSource
from app.schemas.chat import ChatMessageCreate
from app.agent.graph import build_graph
from app.agent.nodes import GRADER_TAG
from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.core.logging import get_logger
from app.services.suggestion_service import suggest_follow_ups

logger = get_logger(__name__)

# Prior turns sent to the model with each new question
HISTORY_MESSAGES = 10
HISTORY_CHARS_PER_MESSAGE = 4000

# Separates the answer from the auto-generated reference list (the frontend splits on it)
REFERENCES_MARKER = "\n\n---\n**References**\n"

STEP_DESCRIPTIONS = {
    "retrieve": "Searching your library and knowledge graph",
    "web_search": "Searching the web for sources",
    "evaluate": "Checking the evidence",
    "generate": "Reasoning over the evidence",
}
RETRY_STEP = {
    "library": "Not enough evidence yet, searching your library again for: {query}",
    "web": "Not enough evidence yet, searching the web for: {query}",
}
NODE_SEARCH_SOURCE = {"retrieve": "library", "web_search": "web"}


def _is_answer_token(event: dict) -> bool:
    """Only the generate node's tokens are streamed; grader / query-rewrite calls stay internal."""
    if GRADER_TAG in (event.get("tags") or []):
        return False
    node = (event.get("metadata") or {}).get("langgraph_node")
    return node is None or node == "generate"


CREDIT_ERROR_MARKERS = ("402", "credits", "prepayment", "billing", "payment required")
QUOTA_ERROR_MARKERS = ("resource_exhausted", "429", "quota", "rate limit")


def describe_generation_error(exc: Exception | None) -> dict:
    """User-facing reason a reply couldn't be generated, plus a stable code for the frontend."""
    if isinstance(exc, RateLimitError):
        return {"error_code": "rate_limited", "error": "Too many research requests right now — try again in a minute."}
    text = str(exc or "").lower()
    if any(marker in text for marker in CREDIT_ERROR_MARKERS):
        return {"error_code": "provider_credits", "error": "The AI provider's credits are exhausted — try again later."}
    if any(marker in text for marker in QUOTA_ERROR_MARKERS):
        return {"error_code": "provider_quota", "error": "The AI provider's usage limit was reached — try again later."}
    return {"error_code": "generation_failed", "error": "The research agent couldn't generate an answer. Please try again."}


class AnswerLineLimiter:
    """Passes streamed answer text through until it reaches `max_lines` lines, then drops the rest.

    The model is asked to stay well under the limit; this is the hard guarantee. Cutting happens on
    a line boundary, and `closing()` re-closes an unfinished code fence and notes the trim.
    """

    def __init__(self, max_lines: int) -> None:
        self.max_lines = max(1, max_lines)
        self.newlines = 0
        self.truncated = False
        self._parts: List[str] = []

    @property
    def text(self) -> str:
        return "".join(self._parts)

    def feed(self, delta: str) -> str:
        """Returns the part of `delta` that fits (empty once the limit is reached)."""
        if self.truncated or not delta:
            return ""
        remaining = (self.max_lines - 1) - self.newlines
        count = delta.count("\n")
        if count <= remaining:
            self.newlines += count
            self._parts.append(delta)
            return delta
        cut = -1
        for _ in range(remaining + 1):
            cut = delta.index("\n", cut + 1)
        kept = delta[:cut]
        self.newlines = self.max_lines - 1
        self.truncated = True
        self._parts.append(kept)
        return kept

    def closing(self) -> str:
        if not self.truncated:
            return ""
        fence_lines = [ln for ln in self.text.split("\n") if ln.lstrip().startswith("```")]
        close_fence = "\n```" if len(fence_lines) % 2 == 1 else ""
        return f"{close_fence}\n\n*Answer trimmed to the {self.max_lines}-line limit.*"


def format_citations(citations_data: list) -> list[dict]:
    """Normalise generate-node citations: one entry per source, in citation order."""
    formatted, seen = [], set()
    for c in sorted(citations_data or [], key=lambda x: x.get("citation_index", 0)):
        if not isinstance(c, dict):
            continue
        title = (c.get("source_title") or f"Source {c.get('citation_index', len(formatted) + 1)}").strip()
        key = str(c.get("source_id") or c.get("canonical_uri") or title.lower())
        if key in seen:
            continue
        seen.add(key)
        formatted.append({
            "citation_index": c.get("citation_index", len(formatted) + 1),
            "source_id": str(c["source_id"]) if c.get("source_id") else None,
            "source_title": title,
            "canonical_uri": c.get("canonical_uri"),
            "source_type": c.get("source_type", "document"),
            "retrieved_via": c.get("retrieved_via"),
            "matched_entities": c.get("matched_entities") or [],
            "snippet": (c.get("content") or "")[:300],
            "chunk_index": c.get("chunk_index", 0),
        })
    return formatted


def _md_link_text(title: str) -> str:
    return title.replace("[", "(").replace("]", ")")


def build_references_markdown(citations: list[dict]) -> str:
    """Reference list with real links, built from what the answer cited (never from model output)."""
    if not citations:
        return ""
    lines = []
    for c in citations:
        title = _md_link_text(c["source_title"])
        url = c.get("canonical_uri")
        label = f"[{title}]({url})" if url else title
        if c.get("source_type") == "web":
            domain = re.sub(r"^www\.", "", urlparse(url).netloc) if url else ""
            origin = f"Web{f' · {domain}' if domain else ''}"
        elif c.get("source_type") == "graph":
            origin = "Knowledge graph of your sources"
        elif c.get("retrieved_via") == "graph" and c.get("matched_entities"):
            origin = f"Your library · linked via {', '.join(c['matched_entities'][:3])}"
        else:
            origin = "Your library"
        lines.append(f"- **[{c['citation_index']}]** {label} — {origin}")
    return REFERENCES_MARKER + "\n".join(lines)

async def get_session_messages(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> List[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .options(selectinload(ChatMessage.citations))
        .order_by(ChatMessage.created_at)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

async def load_conversation_history(db: AsyncSession, session_id: uuid.UUID) -> List[BaseMessage]:
    """Most recent turns of the session as LangChain messages, oldest first."""
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_MESSAGES)
    )
    rows = list((await db.execute(stmt)).scalars().all())

    history: List[BaseMessage] = []
    for msg in reversed(rows):
        content = (msg.content or "").strip()[:HISTORY_CHARS_PER_MESSAGE]
        if not content:
            continue
        if msg.role == MessageRole.user:
            history.append(HumanMessage(content=content))
        elif msg.role == MessageRole.assistant:
            history.append(AIMessage(content=content))
    return history


def merge_consecutive_turns(messages: List[BaseMessage]) -> List[BaseMessage]:
    """Join back-to-back messages from the same role (e.g. a question whose answer failed)."""
    merged: List[BaseMessage] = []
    for msg in messages:
        if merged and type(merged[-1]) is type(msg):
            merged[-1] = type(msg)(content=f"{merged[-1].content}\n\n{msg.content}")
        else:
            merged.append(msg)
    return merged


async def stream_chat_response(db: AsyncSession, session_id: uuid.UUID, message_in: ChatMessageCreate, user_id: uuid.UUID) -> AsyncGenerator[str, None]:
    # Load prior turns before saving the new message so it isn't counted twice
    history = await load_conversation_history(db, session_id)

    # Save user message
    user_msg = ChatMessage(session_id=session_id, role=MessageRole.user, content=message_in.content)
    db.add(user_msg)
    await db.commit()
    
    # Get session sources
    stmt = select(SessionSource.source_id).where(SessionSource.session_id == session_id)
    result = await db.execute(stmt)
    source_ids = [str(row) for row in result.scalars().all()]

    # Auto-detect URLs in user message (e.g. YouTube, GitHub, web links)
    import re
    url_pattern = r'https?://[^\s<>"]+|www\.[^\s<>"]+'
    detected_urls = re.findall(url_pattern, message_in.content)
    if detected_urls:
        from app.services.source_service import create_source
        from app.schemas.sources import SourceCreate
        for raw_url in detected_urls:
            clean_url = raw_url.rstrip(".,;!?)")
            try:
                src_in = SourceCreate(url=clean_url)
                src = await create_source(db=db, source_in=src_in, user_id=user_id)
                if src and src.id:
                    link_stmt = select(SessionSource).where(
                        SessionSource.session_id == session_id,
                        SessionSource.source_id == src.id
                    )
                    link_res = await db.execute(link_stmt)
                    if not link_res.scalars().first():
                        db.add(SessionSource(session_id=session_id, source_id=src.id))
                        await db.commit()
                    if str(src.id) not in source_ids:
                        source_ids.append(str(src.id))
            except Exception:
                pass
    
    graph = build_graph()
    
    state = {
        "session_id": str(session_id),
        "user_id": str(user_id),
        "messages": merge_consecutive_turns(history + [HumanMessage(content=message_in.content)]),
        "source_ids": source_ids,
        "needs_web_search": message_in.force_web_search
    }
    
    config = {"configurable": {"db": db}}
    
    limiter = AnswerLineLimiter(settings.CHAT_MAX_ANSWER_LINES)
    stream_error: Exception | None = None
    citations_data = []
    retrieval_output: dict = {}
    # How the evidence was found, streamed live and saved with the answer
    research_trace: dict = {"searches": [], "retries": 0, "verdict": None}
    retry_query: str | None = None

    try:
        async for event in graph.astream_events(state, config=config, version="v2"):
            kind = event.get("event")
            name = event.get("name")

            # Emit stage progression steps for UI (searches say where, and the rewritten query on a retry)
            if kind == "on_chain_start" and name in STEP_DESCRIPTIONS:
                step_event = {'status': 'step', 'stage': name, 'step': STEP_DESCRIPTIONS[name]}
                if name in NODE_SEARCH_SOURCE:
                    step_event['source'] = NODE_SEARCH_SOURCE[name]
                    if retry_query:
                        step_event['query'] = retry_query
                yield f"data: {json.dumps(step_event)}\n\n"

            # Emit token deltas as they are generated by Gemini/LLM (the answer only, never the evidence grader)
            elif kind == "on_chat_model_stream" and _is_answer_token(event):
                chunk = event.get("data", {}).get("chunk")
                if chunk:
                    content = chunk.content
                    delta = ""
                    if isinstance(content, str):
                        delta = content
                    elif isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("text"):
                                delta += part["text"]
                            elif isinstance(part, str):
                                delta += part
                    # Past the line limit the rest of the generation is dropped, but the stream is still
                    # drained so the generate node finishes and reports its citations.
                    allowed = limiter.feed(delta)
                    if allowed:
                        yield f"data: {json.dumps({'delta': allowed})}\n\n"

            # Capture retrieval evidence (for follow-up suggestions) and report what each search found
            elif kind == "on_chain_end" and name in NODE_SEARCH_SOURCE:
                output = event.get("data", {}).get("output")
                if not isinstance(output, dict):
                    continue
                if name == "retrieve":
                    retrieval_output = output
                if output.get("searched"):
                    research_trace["searches"] = output["searched"]
                    yield f"data: {json.dumps({'status': 'search', **output['searched'][-1]})}\n\n"
            elif kind == "on_chain_end" and name == "evaluate":
                # The evidence check's verdict; when it fell short, which rewritten search runs next
                output = event.get("data", {}).get("output")
                if not isinstance(output, dict):
                    continue
                verdict = output.get("evidence_verdict")
                evidence_event = {
                    'status': 'evidence',
                    'sufficient': verdict.get("sufficient") if verdict else None,
                    'reason': verdict.get("reason", "") if verdict else "",
                }
                if verdict:
                    research_trace["verdict"] = {"sufficient": verdict["sufficient"], "reason": verdict.get("reason", "")}
                if output.get("next_source") in RETRY_STEP:
                    retry_query = output.get("search_query") or ""
                    research_trace["retries"] = output.get("retrieval_attempts", research_trace["retries"] + 1)
                    evidence_event['retry'] = {
                        'source': output["next_source"],
                        'query': retry_query,
                        'attempt': research_trace["retries"],
                        'max_attempts': settings.CHAT_MAX_RETRIEVAL_RETRIES,
                    }
                    evidence_event['step'] = RETRY_STEP[output["next_source"]].format(query=retry_query)
                yield f"data: {json.dumps(evidence_event)}\n\n"
            elif kind == "on_chain_end" and name == "generate":
                output = event.get("data", {}).get("output")
                if isinstance(output, dict):
                    citations_data = output.get("citations", [])
    except Exception as e:
        stream_error = e
        logger.error("Research chat generation failed", session_id=str(session_id), error=str(e))

    if not limiter.text.strip():
        # Nothing was generated: tell the user why, and keep the failed reply out of the chat history
        yield f"data: {json.dumps(describe_generation_error(stream_error))}\n\n"
        return

    closing = limiter.closing()
    if closing:
        yield f"data: {json.dumps({'delta': closing})}\n\n"
    answer_text = (limiter.text + closing).strip()
    formatted_citations = format_citations(citations_data)
    if limiter.truncated:
        # Only keep sources still cited in the part of the answer that was kept
        kept_nums = {int(n) for n in re.findall(r"\[(\d+)\]", answer_text)}
        formatted_citations = [c for c in formatted_citations if c["citation_index"] in kept_nums]

    # Append the reference list (streamed too, so it appears before the done event)
    references_md = build_references_markdown(formatted_citations)
    if references_md:
        yield f"data: {json.dumps({'delta': references_md})}\n\n"
    last_message = answer_text + references_md

    # Follow-up questions from the graph and retrieved library sources (no LLM call, no web search)
    suggestions: List[str] = []
    try:
        suggestions = await suggest_follow_ups(
            question=message_in.content,
            user_id=str(user_id),
            graph_evidence=retrieval_output.get("graph_evidence"),
            retrieved_chunks=retrieval_output.get("retrieved_chunks"),
            cited_source_ids=[c["source_id"] for c in formatted_citations if c["source_id"]],
            count=settings.CHAT_SUGGESTION_COUNT,
        )
    except Exception as e:
        print(f"Failed to build follow-up suggestions: {e}")

    # Save assistant message
    asst_msg = ChatMessage(
        session_id=session_id,
        role=MessageRole.assistant,
        content=last_message,
        suggested_questions=suggestions or None,
        research_trace=research_trace if research_trace["searches"] else None,
    )
    db.add(asst_msg)
    await db.commit()
    await db.refresh(asst_msg)

    # Save every cited source, including web pages and graph evidence (source_id is null for those)
    for c in formatted_citations:
        try:
            db.add(MessageCitation(
                message_id=asst_msg.id,
                citation_index=c["citation_index"],
                source_id=uuid.UUID(c["source_id"]) if c["source_id"] else None,
                locator={
                    "chunk_index": c["chunk_index"],
                    "snippet": c["snippet"],
                    "source_title": c["source_title"],
                    "canonical_uri": c["canonical_uri"],
                    "source_type": c["source_type"],
                    "retrieved_via": c["retrieved_via"],
                    "matched_entities": c["matched_entities"],
                },
            ))
        except Exception as cit_err:
            print(f"Error saving citation: {cit_err}")
    if formatted_citations:
        await db.commit()

    # Auto-summarize & update session title and summary if needed
    session_title = None
    session_summary = None
    try:
        from app.services.session_service import update_session_summary_and_title
        src_titles = [c.get("source_title") for c in citations_data if isinstance(c, dict) and c.get("source_title")]
        title_res = await update_session_summary_and_title(
            db=db,
            session_id=session_id,
            user_query=message_in.content,
            assistant_response=answer_text,
            source_titles=src_titles,
        )
        if title_res:
            session_title = title_res.get("title")
            session_summary = title_res.get("summary")
    except Exception as e:
        print(f"Failed to auto-update session summary/title: {e}")

    # Final event: done signal with full content, citations, and updated title/summary
    done_payload = {
        'done': True,
        'content': last_message,
        'message_id': str(asst_msg.id),
        'citations': formatted_citations,
        'suggestions': suggestions,
        'research_trace': asst_msg.research_trace,
    }
    if session_title:
        done_payload['session_title'] = session_title
    if session_summary:
        done_payload['session_summary'] = session_summary
    yield f"data: {json.dumps(done_payload)}\n\n"


    # Persist session memory to PostgreSQL session_memories with vector embeddings
    try:
        from app.services.memory_service import persist_session_memory
        await persist_session_memory(
            db=db,
            session_id=session_id,
            user_query=message_in.content,
            assistant_response=answer_text,
            message_id=asst_msg.id,
        )
    except Exception:
        pass  # Non-critical, don't break chat flow

    # Record interaction in User Memory Graph (non-blocking)
    try:
        from app.memory.store import UserMemoryStore
        store = UserMemoryStore(str(user_id))
        store.record_chat_interaction(
            user_query=message_in.content,
            session_id=str(session_id),
            assistant_reply=answer_text
        )
    except Exception:
        pass  # Non-critical, don't break chat flow
