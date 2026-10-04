from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from pydantic import BaseModel
import uuid

from app.api.deps import get_db, get_current_user
from app.db.models.user import User
from app.graph.engine import graph_engine
from app.memory.store import UserMemoryStore
from app.services.retrieval_service import RetrievalService
from app.schemas.retrieval import RetrievalResult

router = APIRouter()

class ExtractRequest(BaseModel):
    text: str
    source_id: str
    source_title: str

@router.post("/extract")
async def extract_graph(
    req: ExtractRequest,
    current_user: User = Depends(get_current_user)
):
    """Test Graph DB Extraction Pipeline."""
    graph_engine.extract_graph_from_text(
        text=req.text,
        source_id=req.source_id,
        source_title=req.source_title,
        user_id=str(current_user.id)
    )
    return {"status": "success", "message": "Extraction complete."}

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

@router.post("/retrieve", response_model=RetrievalResult)
async def hybrid_retrieve(
    req: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Test Hybrid Search and Semantic Reranking."""
    service = RetrievalService(db)
    # Using user.id as workspace_id for testing purposes
    result = await service.search(workspace_id=current_user.id, query=req.query, top_k=req.top_k)
    return result

class MemoryRequest(BaseModel):
    action: str
    target_node_id: str
    target_label: str = None
    target_type: str = "Concept"

@router.post("/memory")
async def record_memory(
    req: MemoryRequest,
    current_user: User = Depends(get_current_user)
):
    """Test User Memory Interaction Recording."""
    store = UserMemoryStore(str(current_user.id))
    store.record_interaction(
        action=req.action,
        target_node_id=req.target_node_id,
        target_label=req.target_label,
        target_type=req.target_type
    )
    return {"status": "success", "message": f"Recorded {req.action} interaction."}

@router.get("/curiosity")
async def get_curiosity_prompts(
    current_user: User = Depends(get_current_user)
):
    """Test Curiosity Engine Prompt Suggestions."""
    store = UserMemoryStore(str(current_user.id))
    prompts = store.suggest_prompts()
    map_data = store.get_curiosity_map()
    return {
        "suggested_prompts": prompts,
        "curiosity_map": map_data
    }
