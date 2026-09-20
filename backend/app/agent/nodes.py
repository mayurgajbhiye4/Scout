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

# Initialize LLM and Embeddings
llm = ChatGoogleGenerativeAI(model=settings.LLM_MODEL, google_api_key=settings.GEMINI_API_KEY)
embeddings = GoogleGenerativeAIEmbeddings(model=f"models/{settings.EMBEDDING_MODEL}", google_api_key=settings.GEMINI_API_KEY)

async def retrieve_node(state: ResearchChatState, config: RunnableConfig | None = None) -> dict:
    """Retrieve relevant chunks from the database using vector search."""
    db: AsyncSession | None = config.get("configurable", {}).get("db") if config else None
    if not db:
        return {"retrieved_chunks": []}

    source_ids = state.get("source_ids", [])
    messages = state.get("messages", [])
    
    if not source_ids or not messages:
        return {"retrieved_chunks": []}
    
    # We assume the last message is from the user
    last_message = messages[-1]
    if not isinstance(last_message, HumanMessage):
        return {"retrieved_chunks": []}
    
    query = last_message.content
    if isinstance(query, list):
        query = " ".join([part.get("text", "") if isinstance(part, dict) else str(part) for part in query])
    query_embedding = await embeddings.aembed_query(query)
    query_embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"
    
    source_uuids = [uuid.UUID(sid) for sid in source_ids]
    
    # Using L2 distance (<->) in pgvector
    stmt = text("""
        SELECT id, source_id, chunk_index, content, embedding <-> :embedding AS distance
        FROM source_chunks
        WHERE source_id = ANY(:source_ids)
        ORDER BY distance LIMIT 5
    """)
    
    result = await db.execute(stmt, {"embedding": query_embedding_str, "source_ids": source_uuids})
    rows = result.fetchall()
    
    retrieved_chunks = []
    for row in rows:
        retrieved_chunks.append({
            "id": str(row.id),
            "source_id": str(row.source_id),
            "chunk_index": row.chunk_index,
            "content": row.content,
            "distance": row.distance
        })
        
    return {"retrieved_chunks": retrieved_chunks}

async def web_search_node(state: ResearchChatState) -> dict:
    """Perform a web search using Tavily."""
    # Stub for web search
    return {"web_search_results": []}

def should_search_web(state: ResearchChatState) -> str:
    if state.get("needs_web_search"):
        return "web_search"
    return "generate"

async def generate_node(state: ResearchChatState) -> dict:
    """Generate the final response using the LLM and retrieved context."""
    messages = state.get("messages", [])
    chunks = state.get("retrieved_chunks", [])
    
    context_str = ""
    if chunks:
        context_str = "Context from sources:\n"
        for i, chunk in enumerate(chunks):
            context_str += f"[{i+1}] {chunk['content']}\n\n"
            
    system_prompt = (
        "You are an AI research assistant. Use the provided context to answer the user's question. "
        "Cite the sources using their numerical indices, e.g., [1]. "
        "If you don't know the answer based on the context, say so.\n\n"
        f"{context_str}"
    )
    
    # Prepare messages for LLM
    llm_messages = [SystemMessage(content=system_prompt)]
    # Add conversation history
    llm_messages.extend(messages[-5:])
    
    response = await llm.ainvoke(llm_messages)
    
    return {"messages": [response], "citations": chunks}
