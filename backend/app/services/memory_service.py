"""Session Memory service for extracting, embedding, and persisting long-term chat memory."""

import contextlib
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.session_memory import MemoryType, SessionMemory
from app.services.embedding_service import EmbeddingUnavailable, generate_embeddings

logger = get_logger(__name__)


async def persist_session_memory(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_query: str,
    assistant_response: str,
    message_id: uuid.UUID | None = None,
) -> SessionMemory | None:
    """
    Extracts a concise research insight from a chat exchange, generates its vector embedding,
    and stores it in the `session_memories` table.
    """
    if not user_query or not assistant_response:
        return None

    try:
        # 1. Synthesize concise memory content
        memory_content = ""
        try:
            from langchain_core.prompts import PromptTemplate
            from langchain_google_genai import ChatGoogleGenerativeAI

            from app.core.config import settings

            llm = ChatGoogleGenerativeAI(
                model=settings.LLM_MODEL,
                google_api_key=settings.GEMINI_API_KEY,
                temperature=0,
            )
            prompt = PromptTemplate.from_template(
                "Extract 1 concise, factual research insight or key context established in this exchange (under 25 words).\n"
                "User query: {query}\n"
                "Assistant response: {response}\n"
                "Return ONLY the concise statement without preamble or quotes."
            )
            chain = prompt | llm
            res = await chain.ainvoke(
                {"query": user_query[:300], "response": assistant_response[:600]}
            )
            content_val = res.content
            if isinstance(content_val, list):
                memory_content = "".join(
                    [p.get("text", "") if isinstance(p, dict) else str(p) for p in content_val]
                ).strip()
            else:
                memory_content = str(content_val).strip()
        except Exception as llm_err:
            logger.debug(f"LLM memory extraction fallback: {llm_err}")

        # Fallback if LLM extraction failed or returned empty
        if not memory_content or len(memory_content) < 5:
            clean_resp = assistant_response.replace("\n", " ").strip()
            if len(clean_resp) > 180:
                clean_resp = clean_resp[:180] + "..."
            memory_content = f"Q: {user_query[:80]} | Insight: {clean_resp}"

        # 2. Generate vector embedding for the memory content
        # Raises when Gemini is unavailable; the memory is skipped rather than saved with a fake vector
        embeddings = await generate_embeddings([memory_content])

        # 3. Persist SessionMemory in PostgreSQL
        mem = SessionMemory(
            session_id=session_id,
            type=MemoryType.research_context,
            content=memory_content,
            source_message_id=message_id,
            importance=2,
            embedding=embeddings[0],
        )
        db.add(mem)
        await db.commit()
        await db.refresh(mem)
        logger.info("Persisted session memory", session_id=str(session_id), memory_id=str(mem.id))
        return mem

    except Exception as e:
        logger.warning(f"Error persisting session memory: {e}")
        with contextlib.suppress(Exception):
            await db.rollback()
        return None


async def retrieve_session_memories(
    db: AsyncSession,
    session_id: uuid.UUID | None,
    query: str,
    user_id: uuid.UUID | None = None,
    query_embedding_str: str | None = None,
    limit: int = 4,
) -> list[dict[str, Any]]:
    """
    Search relevant session memories from previous turns or sessions using pgvector cosine similarity.
    """
    if not db or not query or (not session_id and not user_id):
        return []

    try:
        where_conditions = []
        params: dict[str, Any] = {"limit": limit}
        if session_id:
            where_conditions.append("sm.session_id = :session_id")
            params["session_id"] = session_id
        if user_id:
            where_conditions.append("rs.user_id = :user_id")
            params["user_id"] = user_id

        if not where_conditions:
            return []

        where_sql = " OR ".join(where_conditions)

        # Fast check: verify if any matching session memories exist
        check_stmt = text(f"""
            SELECT 1 FROM session_memories sm
            JOIN research_sessions rs ON sm.session_id = rs.id
            WHERE {where_sql}
            LIMIT 1
        """)  # noqa: S608 - where_sql is built from fixed strings; values are bind params
        check_params = {k: v for k, v in params.items() if k != "limit"}
        check_res = await db.execute(check_stmt, check_params)
        if not check_res.first():
            return []

        # Generate embedding for the query if not provided
        if not query_embedding_str:
            try:
                query_embeddings = await generate_embeddings([query])
            except EmbeddingUnavailable:
                return []
            query_embedding_str = "[" + ",".join(map(str, query_embeddings[0])) + "]"

        params["embedding"] = query_embedding_str

        stmt = text(f"""
            SELECT sm.id, sm.type, sm.content, sm.importance,
                   sm.embedding <-> :embedding AS distance
            FROM session_memories sm
            JOIN research_sessions rs ON sm.session_id = rs.id
            WHERE {where_sql}
            ORDER BY distance ASC
            LIMIT :limit
        """)  # noqa: S608 - where_sql is built from fixed strings; values are bind params
        result = await db.execute(stmt, params)
        rows = result.fetchall()

        memories = []
        for r in rows:
            memories.append(
                {
                    "id": str(r.id),
                    "type": r.type
                    if isinstance(r.type, str)
                    else getattr(r.type, "value", "research_context"),
                    "content": r.content,
                    "importance": r.importance,
                    "distance": float(r.distance) if r.distance is not None else 0.0,
                }
            )
        return memories

    except Exception as e:
        logger.warning(f"Error retrieving session memories: {e}")
        return []
