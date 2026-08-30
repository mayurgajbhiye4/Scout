"""
Integration test for LangGraph research workflow end-to-end execution.
"""

import pytest
from app.agents.graph import research_graph


@pytest.mark.asyncio
async def test_research_graph_execution():
    initial_state = {
        "session_id": "test-session-123",
        "workspace_id": "test-ws-123",
        "original_question": "What are the architectural trade-offs of microservices vs modular monoliths?",
        "research_depth": "quick",
        "plan": None,
        "tasks": [],
        "current_task_idx": 0,
        "gathered_evidence": [],
        "contradictions": [],
        "draft_report": "",
        "final_report": "",
        "revision_count": 0,
        "critic_feedback": [],
        "errors": []
    }

    final_state = await research_graph.ainvoke(initial_state)

    assert "final_report" in final_state
    assert len(final_state["final_report"]) > 0
    assert len(final_state.get("gathered_evidence", [])) > 0
    assert final_state["current_task_idx"] >= len(final_state.get("tasks", []))
