"""
Planner Node — Decomposes the research question into structured sub-tasks.
"""

import json
from app.agents.llm.factory import get_llm
from app.agents.prompts import PLANNER_PROMPT
from app.agents.schemas import ResearchPlan, TaskSchema
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def planner_node(state: AgentState) -> dict:
    """Break down the research question into sub-tasks."""
    logger.info("Planner decomposing question", question=state["original_question"][:60])
    
    llm = get_llm()
    prompt = PLANNER_PROMPT.format(
        question=state["original_question"],
        depth=state.get("research_depth", "standard")
    )
    
    try:
        response_text = await llm.generate(
            prompt=prompt,
            response_schema=ResearchPlan.model_json_schema()
        )
        data = json.loads(response_text)
        tasks_raw = data.get("tasks", [])
        tasks = [TaskSchema(**t) for t in tasks_raw] if tasks_raw else []
        plan = ResearchPlan(**data)
    except Exception as e:
        logger.warning("Planner fallback due to JSON parsing error", error=str(e))
        # Deterministic fallback tasks
        tasks = [
            TaskSchema(
                id="task_1",
                question=f"Analyze foundational concepts and architecture for: {state['original_question']}",
                task_type="mixed",
                priority=1
            ),
            TaskSchema(
                id="task_2",
                question=f"Evaluate trade-offs, performance, and benchmarks for: {state['original_question']}",
                task_type="web",
                priority=2
            ),
            TaskSchema(
                id="task_3",
                question=f"Identify best practices and real-world recommendations for: {state['original_question']}",
                task_type="workspace",
                priority=3
            ),
        ]
        plan = ResearchPlan(
            goal=state["original_question"],
            sub_questions=[t.question for t in tasks],
            required_source_types=["web", "workspace"],
            tasks=tasks,
            success_criteria=["Address core architecture", "Identify trade-offs", "Provide actionable conclusion"]
        )

    return {
        "plan": plan,
        "tasks": tasks,
        "current_task_idx": 0,
        "gathered_evidence": [],
        "contradictions": [],
        "revision_count": 0,
        "critic_feedback": [],
        "errors": []
    }
