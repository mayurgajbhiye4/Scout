"""
Router Node — Decides worker execution routing for sub-tasks.
"""

from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


def route_research(state: AgentState) -> str:
    """
    Evaluates whether more research tasks need execution or if the workflow
    should advance to evidence extraction and synthesis.
    """
    idx = state.get("current_task_idx", 0)
    tasks = state.get("tasks", [])

    if idx < len(tasks):
        current_task = tasks[idx]
        task_type = getattr(current_task, "task_type", "mixed")
        if isinstance(current_task, dict):
            task_type = current_task.get("task_type", "mixed")
            
        logger.info("Routing research task", index=idx, total=len(tasks), task_type=task_type)
        if task_type == "workspace":
            return "retriever"
        elif task_type in ("web", "github"):
            return "researcher"
        else:
            return "researcher"  # Mixed routes through researcher with workspace fallback
            
    logger.info("All tasks completed, advancing to evidence extraction", total_evidence=len(state.get("gathered_evidence", [])))
    return "evidence"


async def router_node(state: AgentState) -> dict:
    """Router node state pass-through / logging."""
    logger.info("Router evaluating state", current_idx=state.get("current_task_idx", 0))
    return {}
