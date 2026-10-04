"""Knowledge Graph & User Memory API router."""
from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.db.models.user import User
from app.graph.engine import graph_engine
from app.memory.store import UserMemoryStore

router = APIRouter()


class MemoryInteractionRequest(BaseModel):
    action: str  # LIKES, DISLIKES, EXPLORED, CURIOUS_ABOUT
    target_node_id: str
    target_label: str | None = None
    target_type: str = "Concept"


class CuriosityResponse(BaseModel):
    suggested_prompts: List[str]
    curiosity_map: List[Dict[str, Any]]


class KnowledgeGraphResponse(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]


@router.post("/memory/interact")
async def record_interaction(
    req: MemoryInteractionRequest,
    current_user: User = Depends(get_current_user)
):
    """Record a user memory interaction (like, dislike, explore, curious_about)."""
    store = UserMemoryStore(str(current_user.id))
    store.record_interaction(
        action=req.action,
        target_node_id=req.target_node_id,
        target_label=req.target_label,
        target_type=req.target_type
    )
    return {"status": "success"}


@router.get("/memory/curiosity", response_model=CuriosityResponse)
async def get_curiosity(
    current_user: User = Depends(get_current_user)
):
    """Get personalized prompt suggestions and curiosity map for the user."""
    store = UserMemoryStore(str(current_user.id))
    prompts = store.suggest_prompts()
    curiosity_map = store.get_curiosity_map()
    return CuriosityResponse(
        suggested_prompts=prompts,
        curiosity_map=curiosity_map
    )


@router.get("/graph", response_model=KnowledgeGraphResponse)
async def get_knowledge_graph(
    current_user: User = Depends(get_current_user)
):
    """Get the full knowledge graph for the authenticated user."""
    graph_data = graph_engine.get_full_user_graph(str(current_user.id))
    return KnowledgeGraphResponse(
        nodes=graph_data.get("nodes", []),
        edges=graph_data.get("edges", [])
    )
