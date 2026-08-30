"""
Typed LangGraph state definition for the AI Research Workspace.
"""

import operator
from typing import Annotated, TypedDict

from app.agents.schemas import (
    ContradictionItem,
    EvidenceItem,
    ResearchPlan,
    TaskSchema,
)


class AgentState(TypedDict):
    """
    The state dictionary maintained across the LangGraph workflow.
    """
    session_id: str
    workspace_id: str
    original_question: str
    research_depth: str

    # Planning & Tasks
    plan: ResearchPlan | None
    tasks: list[TaskSchema]
    current_task_idx: int

    # Parallel & accumulated research evidence
    gathered_evidence: Annotated[list[EvidenceItem], operator.add]
    
    # Contradiction detection
    contradictions: list[ContradictionItem]

    # Drafting, Critique, and Reflection
    draft_report: str
    final_report: str
    revision_count: int
    critic_feedback: list[str]
    errors: list[str]
