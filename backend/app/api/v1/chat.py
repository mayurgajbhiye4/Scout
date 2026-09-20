"""Chat API router."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid

from app.api.deps import get_db, get_current_user
from app.db.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageRead
from app.services.chat_service import stream_chat_response, get_session_messages

router = APIRouter()

@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageRead])
async def read_chat_messages(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Get all chat messages for a session."""
    return await get_session_messages(db, session_id=session_id, user_id=current_user.id)

@router.post("/sessions/{session_id}/chat")
async def chat_with_session(
    *,
    db: AsyncSession = Depends(get_db),
    session_id: uuid.UUID,
    message_in: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
):
    """Send a chat message and stream the response."""
    return StreamingResponse(
        stream_chat_response(db, session_id, message_in, current_user.id),
        media_type="text/event-stream"
    )
