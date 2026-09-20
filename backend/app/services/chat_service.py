"""Chat service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import uuid
import json
from typing import AsyncGenerator, List
from langchain_core.messages import HumanMessage

from app.db.models.chat_message import ChatMessage, MessageRole, MessageStatus
from app.db.models.message_citation import MessageCitation
from app.db.models.session_source import SessionSource
from app.schemas.chat import ChatMessageCreate
from app.agent.graph import build_graph

async def get_session_messages(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> List[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .options(selectinload(ChatMessage.citations))
        .order_by(ChatMessage.created_at)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

async def stream_chat_response(db: AsyncSession, session_id: uuid.UUID, message_in: ChatMessageCreate, user_id: uuid.UUID) -> AsyncGenerator[str, None]:
    # Save user message
    user_msg = ChatMessage(session_id=session_id, role=MessageRole.user, content=message_in.content)
    db.add(user_msg)
    await db.commit()
    
    # Get session sources
    stmt = select(SessionSource.source_id).where(SessionSource.session_id == session_id)
    result = await db.execute(stmt)
    source_ids = [str(row) for row in result.scalars().all()]
    
    graph = build_graph()
    
    state = {
        "session_id": str(session_id),
        "messages": [HumanMessage(content=message_in.content)],
        "source_ids": source_ids,
        "needs_web_search": message_in.force_web_search
    }
    
    config = {"configurable": {"db": db}}
    
    final_state = None
    # Use streaming
    async for event in graph.astream(state, config=config, stream_mode="values"):
        final_state = event
        yield f"data: {json.dumps({'status': 'processing'})}\n\n"
        
    if final_state and "messages" in final_state and final_state["messages"]:
        raw_content = final_state["messages"][-1].content
        if isinstance(raw_content, list):
            last_message = "".join([part.get("text", "") if isinstance(part, dict) else str(part) for part in raw_content])
        else:
            last_message = str(raw_content)
    else:
        last_message = "I'm sorry, I couldn't generate a response."
    
    yield f"data: {json.dumps({'content': last_message})}\n\n"
    
    # Save assistant message
    asst_msg = ChatMessage(session_id=session_id, role=MessageRole.assistant, content=last_message)
    db.add(asst_msg)
    await db.commit()
    await db.refresh(asst_msg)

    # Save citations if any
    citations_data = final_state.get("citations", []) if final_state else []
    for i, c in enumerate(citations_data):
        try:
            cit = MessageCitation(
                message_id=asst_msg.id,
                citation_index=i + 1,
                source_id=uuid.UUID(c["source_id"]) if isinstance(c.get("source_id"), str) else c["source_id"],
                locator={"chunk_index": c.get("chunk_index", 0), "snippet": c.get("content", "")[:200]},
            )
            db.add(cit)
        except Exception:
            pass
    if citations_data:
        await db.commit()
