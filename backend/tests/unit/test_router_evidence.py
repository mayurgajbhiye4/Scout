"""
Unit tests for agent router decision logic and evidence normalization.
"""

import pytest
from app.agents.nodes.evidence import evidence_node
from app.agents.nodes.router import route_research
from app.agents.schemas import EvidenceItem, TaskSchema


def test_route_research_transitions():
    tasks = [
        TaskSchema(id="t1", question="Query 1", task_type="workspace"),
        TaskSchema(id="t2", question="Query 2", task_type="web"),
    ]

    state_0 = {"current_task_idx": 0, "tasks": tasks, "gathered_evidence": []}
    assert route_research(state_0) == "retriever"

    state_1 = {"current_task_idx": 1, "tasks": tasks, "gathered_evidence": []}
    assert route_research(state_1) == "researcher"

    state_done = {"current_task_idx": 2, "tasks": tasks, "gathered_evidence": []}
    assert route_research(state_done) == "evidence"


@pytest.mark.asyncio
async def test_evidence_normalization_and_deduplication():
    raw_items = [
        EvidenceItem(claim="PostgreSQL is relational", supporting_excerpt="Excerpt A", source_title="Docs 1", confidence=0.9),
        EvidenceItem(claim="PostgreSQL is relational", supporting_excerpt="Excerpt B", source_title="Docs 2", confidence=0.95),  # duplicate
        EvidenceItem(claim="Pinecone is managed", supporting_excerpt="Excerpt C", source_title="Docs 3", confidence=0.88),
    ]

    state = {
        "original_question": "Compare databases",
        "gathered_evidence": raw_items
    }

    result = await evidence_node(state)
    deduped = result["gathered_evidence"]
    assert len(deduped) == 2
    claims = [item.claim for item in deduped]
    assert "PostgreSQL is relational" in claims
    assert "Pinecone is managed" in claims
