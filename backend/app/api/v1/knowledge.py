"""Knowledge Graph & User Memory API router."""
import asyncio
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


class GraphSummaryItem(BaseModel):
    id: str
    title: str
    description: str | None = None
    type: str  # 'universal', 'document', 'memory'
    source_id: str | None = None
    node_count: int
    edge_count: int
    top_entities: List[str] = []
    created_at: str | None = None


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
    refresh: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get personalized prompt suggestions and curiosity map for the user with parallel non-blocking execution."""
    store = UserMemoryStore(str(current_user.id))
    prompts, curiosity_map = await asyncio.gather(
        store.suggest_prompts(force_refresh=refresh),
        store.get_curiosity_map()
    )
    return CuriosityResponse(
        suggested_prompts=prompts,
        curiosity_map=curiosity_map
    )


@router.get("/graphs", response_model=List[GraphSummaryItem])
async def list_graphs(
    current_user: User = Depends(get_current_user)
):
    """List all available knowledge graphs (universal, mindmap, and per-document subgraphs) for graph browser."""
    return await asyncio.to_thread(graph_engine.list_user_graphs, str(current_user.id))


@router.get("/graph", response_model=KnowledgeGraphResponse)
async def get_knowledge_graph(
    graph_id: str = "universal",
    current_user: User = Depends(get_current_user)
):
    """Get a specific knowledge graph by ID (universal, memory, or document subgraph)."""
    graph_data = await asyncio.to_thread(
        graph_engine.get_graph_by_id,
        str(current_user.id),
        graph_id
    )
    return KnowledgeGraphResponse(
        nodes=graph_data.get("nodes", []),
        edges=graph_data.get("edges", [])
    )


@router.get("/graphs/{graph_id}", response_model=KnowledgeGraphResponse)
async def get_graph_by_id_endpoint(
    graph_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific knowledge graph by path ID."""
    graph_data = await asyncio.to_thread(
        graph_engine.get_graph_by_id,
        str(current_user.id),
        graph_id
    )
    return KnowledgeGraphResponse(
        nodes=graph_data.get("nodes", []),
        edges=graph_data.get("edges", [])
    )
