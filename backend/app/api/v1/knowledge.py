"""Knowledge Graph & User Memory API router."""
import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Depends
from typing import List, Dict, Any, Tuple
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import RateLimitError
from app.core.rate_limit import (
    rate_limit_knowledge_interact,
    rate_limit_knowledge_curiosity,
    rate_limit_knowledge_graphs,
    rate_limit_knowledge_reextract,
)
from app.db.models.source import Source, SourceStatus
from app.db.models.user import User
from app.graph.engine import graph_engine
from app.memory.store import UserMemoryStore, invalidate_prompts_cache

logger = logging.getLogger(__name__)

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


class ReextractResponse(BaseModel):
    queued: int
    already_running: bool = False


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


@router.post("/memory/interact", dependencies=[Depends(rate_limit_knowledge_interact)])
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


@router.get("/memory/curiosity", response_model=CuriosityResponse, dependencies=[Depends(rate_limit_knowledge_curiosity)])
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


@router.get("/graphs", response_model=List[GraphSummaryItem], dependencies=[Depends(rate_limit_knowledge_graphs)])
async def list_graphs(
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 20,
):
    """List all available knowledge graphs (universal, mindmap, and per-document subgraphs) for graph browser."""
    return await asyncio.to_thread(graph_engine.list_user_graphs, str(current_user.id), skip=skip, limit=limit)


@router.get("/graph", response_model=KnowledgeGraphResponse, dependencies=[Depends(rate_limit_knowledge_graphs)])
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


@router.get("/graphs/{graph_id}", response_model=KnowledgeGraphResponse, dependencies=[Depends(rate_limit_knowledge_graphs)])
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


# Users with a rebuild in flight, so a second click doesn't start a parallel run
_REEXTRACT_RUNNING: set[str] = set()
_REEXTRACT_MAX_RETRIES = 3


async def _reextract_sources(user_id: str, sources: List[Tuple[str, str, str]]) -> None:
    """Re-runs extraction for each source in turn, waiting out the pipeline LLM limit when it trips."""
    try:
        for source_id, title, text in sources:
            for _ in range(_REEXTRACT_MAX_RETRIES):
                try:
                    await asyncio.to_thread(graph_engine.reextract_source, text, source_id, title, user_id)
                    break
                except RateLimitError as e:
                    await asyncio.sleep((e.retry_after or 30) + 1)
            else:
                logger.warning("Gave up rebuilding relations for source %s after rate-limit retries", source_id)
    finally:
        invalidate_prompts_cache(user_id)
        _REEXTRACT_RUNNING.discard(user_id)


@router.post("/graph/reextract", response_model=ReextractResponse, dependencies=[Depends(rate_limit_knowledge_reextract)])
async def reextract_graph(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rebuild typed, described relations for every indexed source. Returns at once; the work runs in the background."""
    user_id = str(current_user.id)
    if user_id in _REEXTRACT_RUNNING:
        return ReextractResponse(queued=0, already_running=True)

    stmt = select(Source.id, Source.title, Source.content_text).where(
        Source.user_id == current_user.id,
        Source.status == SourceStatus.indexed,
        Source.content_text.is_not(None),
    )
    rows = (await db.execute(stmt)).all()
    sources = [(str(sid), title or "Untitled Source", text[:2500]) for sid, title, text in rows if text]
    if sources and graph_engine.driver:
        _REEXTRACT_RUNNING.add(user_id)
        background_tasks.add_task(_reextract_sources, user_id, sources)
        return ReextractResponse(queued=len(sources))
    return ReextractResponse(queued=0)
