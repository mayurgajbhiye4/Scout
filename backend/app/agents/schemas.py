"""
Pydantic schemas for LangGraph structured outputs and inter-node communication.
"""

from typing import Literal
from pydantic import BaseModel, Field


class TaskSchema(BaseModel):
    id: str = Field(description="Unique task ID, e.g., task_1")
    question: str = Field(description="The specific sub-question to answer")
    task_type: Literal["web", "workspace", "github", "mixed"] = Field(
        default="mixed",
        description="One of: web, workspace, github, mixed"
    )
    priority: int = Field(default=1, description="Execution priority from 1 (highest) to 5")


class ResearchPlan(BaseModel):
    goal: str = Field(description="High-level goal of the research investigation")
    sub_questions: list[str] = Field(default_factory=list, description="Key inquiry sub-questions")
    required_source_types: list[str] = Field(default_factory=list, description="Source types needed: web, workspace, github, etc.")
    tasks: list[TaskSchema] = Field(description="List of concrete research tasks to execute")
    success_criteria: list[str] = Field(default_factory=list, description="Checklist criteria for a complete answer")


class RouteDecision(BaseModel):
    task_id: str
    target_worker: Literal["web", "retriever", "github", "mixed"]
    reasoning: str


class EvidenceItem(BaseModel):
    claim: str = Field(description="The factual claim asserted")
    supporting_excerpt: str = Field(description="Exact verbatim excerpt from the source")
    source_id: str | None = Field(default=None, description="Reference to source ID if from workspace/url")
    source_title: str = Field(default="External Source", description="Title or URL of the source")
    source_url: str | None = Field(default=None, description="URL if accessible online")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0")


class ResearchResult(BaseModel):
    task_id: str
    evidence: list[EvidenceItem] = Field(default_factory=list)


class ContradictionItem(BaseModel):
    claim_a: str = Field(description="First claim")
    evidence_a: str = Field(description="Supporting excerpt for claim A")
    source_a: str = Field(description="Source of claim A")
    claim_b: str = Field(description="Conflicting claim")
    evidence_b: str = Field(description="Supporting excerpt for claim B")
    source_b: str = Field(description="Source of claim B")
    resolution_note: str = Field(description="Nuance, context, or explanation of the difference")


class ContradictionAnalysisResult(BaseModel):
    contradictions: list[ContradictionItem] = Field(default_factory=list)


class CritiqueIssue(BaseModel):
    type: Literal["missing_citation", "unsupported_claim", "hallucination", "incomplete", "formatting"]
    description: str
    severity: Literal["low", "medium", "high"] = "medium"


class CritiqueResult(BaseModel):
    is_approved: bool = Field(description="True if the report meets all quality and citation criteria")
    score: float = Field(default=0.85, ge=0.0, le=1.0, description="Quality score 0.0 to 1.0")
    issues: list[CritiqueIssue] = Field(default_factory=list, description="Identified issues")
    revision_instructions: list[str] = Field(default_factory=list, description="Actionable revision instructions")
    final_report: str | None = Field(default=None, description="Polished final Markdown report if approved")
