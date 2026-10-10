"""LangGraph nodes for Research Chat."""
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import uuid

from app.agent.state import ResearchChatState
from app.core.config import settings
from app.services.embedding_service import generate_embeddings

# Initialize LLM
llm = ChatGoogleGenerativeAI(model=settings.LLM_MODEL, google_api_key=settings.GEMINI_API_KEY)

async def retrieve_node(state: ResearchChatState, config: RunnableConfig | None = None) -> dict:
    """Retrieve relevant knowledge graph context, user memory, and vector source chunks."""
    messages = state.get("messages", [])
    if not messages:
        return {"retrieved_chunks": [], "graph_context": ""}

    # Extract query text from the latest user message
    last_message = messages[-1]
    query = last_message.content if hasattr(last_message, "content") else str(last_message)
    if isinstance(query, list):
        query = " ".join([part.get("text", "") if isinstance(part, dict) else str(part) for part in query])
    query = str(query).strip()

    user_id = state.get("user_id")
    graph_context = ""

    # 1. Retrieve Knowledge Graph & User Memory context from Neo4j
    if user_id and query:
        try:
            from app.graph.engine import graph_engine
            if graph_engine:
                graph_context = graph_engine.get_query_context(query=query, user_id=str(user_id))
        except Exception as e:
            print(f"Error querying knowledge graph context: {e}")

    # 2. Retrieve Vector Chunks from PostgreSQL
    retrieved_chunks = []
    retrieved_memories = []
    db: AsyncSession | None = config.get("configurable", {}).get("db") if config else None
    source_ids = state.get("source_ids", [])
    session_id = state.get("session_id")
    sess_uuid = uuid.UUID(str(session_id)) if session_id else None
    u_uuid = uuid.UUID(str(user_id)) if user_id else None

    if db and query:
        try:
            # Retrieve session memories from previous interactions
            from app.services.memory_service import retrieve_session_memories
            retrieved_memories = await retrieve_session_memories(
                db=db,
                session_id=sess_uuid,
                query=query,
                user_id=u_uuid,
                limit=3,
            )

            source_uuids = [uuid.UUID(sid) for sid in source_ids if sid] if source_ids else []
            has_candidate_chunks = False
            if source_uuids:
                check_stmt = text("SELECT 1 FROM source_chunks WHERE source_id = ANY(:source_ids) LIMIT 1")
                check_res = await db.execute(check_stmt, {"source_ids": source_uuids})
                has_candidate_chunks = check_res.first() is not None
            elif u_uuid:
                check_stmt = text("""
                    SELECT 1 FROM source_chunks sc
                    JOIN sources s ON sc.source_id = s.id
                    WHERE s.user_id = :user_id
                    LIMIT 1
                """)
                check_res = await db.execute(check_stmt, {"user_id": u_uuid})
                has_candidate_chunks = check_res.first() is not None

            if has_candidate_chunks:
                query_embeddings = await generate_embeddings([query])
                if query_embeddings:
                    query_embedding = query_embeddings[0]
                    query_embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"

                    is_summary = any(kw in query.lower() for kw in ["summar", "overview", "what is this", "explain", "about", "tl;dr", "key point", "takeaway", "outline"])

                    if source_uuids:
                        stmt = text("""
                            SELECT sc.id, sc.source_id, sc.chunk_index, sc.content,
                                   sc.embedding <-> :embedding AS distance,
                                   s.title AS source_title
                            FROM source_chunks sc
                            JOIN sources s ON sc.source_id = s.id
                            WHERE sc.source_id = ANY(:source_ids)
                            ORDER BY distance LIMIT 8
                        """)
                        result = await db.execute(stmt, {"embedding": query_embedding_str, "source_ids": source_uuids})
                        rows = list(result.fetchall())

                        if is_summary:
                            intro_stmt = text("""
                                SELECT sc.id, sc.source_id, sc.chunk_index, sc.content,
                                       0.0 AS distance,
                                       s.title AS source_title
                                FROM source_chunks sc
                                JOIN sources s ON sc.source_id = s.id
                                WHERE sc.source_id = ANY(:source_ids) AND sc.chunk_index IN (0, 1)
                                ORDER BY sc.chunk_index ASC
                            """)
                            intro_res = await db.execute(intro_stmt, {"source_ids": source_uuids})
                            intro_rows = list(intro_res.fetchall())
                            seen_ids = set()
                            combined_rows = []
                            for r in intro_rows + rows:
                                if r.id not in seen_ids:
                                    seen_ids.add(r.id)
                                    combined_rows.append(r)
                            rows = combined_rows[:8]
                    elif u_uuid:
                        stmt = text("""
                            SELECT sc.id, sc.source_id, sc.chunk_index, sc.content,
                                   sc.embedding <-> :embedding AS distance,
                                   s.title AS source_title
                            FROM source_chunks sc
                            JOIN sources s ON sc.source_id = s.id
                            WHERE s.user_id = :user_id
                            ORDER BY distance LIMIT 8
                        """)
                        result = await db.execute(stmt, {"embedding": query_embedding_str, "user_id": u_uuid})
                        rows = list(result.fetchall())
                    else:
                        rows = []

                    for row in rows:
                        retrieved_chunks.append({
                            "id": str(row.id),
                            "source_id": str(row.source_id),
                            "source_title": getattr(row, "source_title", "Document"),
                            "chunk_index": row.chunk_index,
                            "content": row.content,
                            "distance": float(row.distance) if row.distance is not None else 0.0
                        })
        except Exception as e:
            print(f"Error retrieving vector source chunks or memories: {e}")

    return {
        "retrieved_chunks": retrieved_chunks,
        "session_memories": retrieved_memories,
        "graph_context": graph_context
    }

async def web_search_node(state: ResearchChatState) -> dict:
    """Perform a web search using Tavily."""
    # Stub for web search
    return {"web_search_results": []}

def should_search_web(state: ResearchChatState) -> str:
    if state.get("needs_web_search"):
        return "web_search"
    return "generate"

async def generate_node(state: ResearchChatState) -> dict:
    """Generate the final response using the LLM, knowledge graph, and retrieved context."""
    messages = state.get("messages", [])
    chunks = state.get("retrieved_chunks", [])
    session_memories = state.get("session_memories", [])
    graph_context = state.get("graph_context", "")

    context_sections = []

    if graph_context:
        context_sections.append(f"=== KNOWLEDGE GRAPH & USER MEMORY CONTEXT ===\n{graph_context}")

    if session_memories:
        mem_lines = [f"- {m.get('content')}" for m in session_memories if m.get("content")]
        if mem_lines:
            context_sections.append("=== PAST SESSION MEMORIES & ESTABLISHED INSIGHTS ===\n" + "\n".join(mem_lines))

    if chunks:
        doc_lines = []
        for i, chunk in enumerate(chunks):
            title = chunk.get("source_title", f"Source {i+1}")
            doc_lines.append(f"[{i+1}] ({title}) {chunk['content']}")
        context_sections.append("=== RETRIEVED DOCUMENT SOURCES ===\n" + "\n\n".join(doc_lines))

    context_str = "\n\n".join(context_sections)

    system_prompt = (
        "You are Scout, an advanced, evidence-grounded AI research assistant equipped with a user memory mindmap, "
        "knowledge graph intelligence, and semantic document retrieval.\n\n"
        "CORE CAPABILITIES & DIRECTIVES:\n"
        "1. Evidence Grounding: When relevant Knowledge Graph facts or Document Sources are provided below, "
        "ground your answer directly in them. Cite document sources using numerical badges like [1], [2].\n"
        "2. Knowledge Graph & Memory Continuity: Seamlessly connect relevant concepts, technologies, and entities from the user's "
        "knowledge graph and past explorations to provide tailored, personalized continuity.\n"
        "3. Intelligent Reasoning & Synthesis: If the question asks about a topic beyond the provided context or documents, "
        "provide an authoritative, accurate, and deeply articulate answer using your extensive general scientific, technical, "
        "and analytical knowledge, while still incorporating any related graph facts or memory.\n"
        "4. NEVER REFUSE: Never say 'no context was provided with your request' or refuse to answer. Always provide a high-quality, comprehensive research response.\n"
        "5. Output Style: Professional, engaging, and thorough. Use markdown formatting with crisp bullet points, code blocks, and bold emphasis where appropriate."
    )

    if context_str:
        system_prompt += f"\n\nPROVIDED CONTEXT:\n{context_str}"

    # Prepare messages for LLM
    llm_messages = [SystemMessage(content=system_prompt)]
    # Add conversation history
    llm_messages.extend(messages[-6:])

    response = await llm.ainvoke(llm_messages)

    return {"messages": [response], "citations": chunks}
