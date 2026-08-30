"""
Critic Node — Peer review and reflection node for evaluating draft reports.
"""

import json
from app.agents.llm.factory import get_llm
from app.agents.prompts import CRITIC_PROMPT
from app.agents.schemas import CritiqueResult
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)

MAX_AGENT_REVISIONS = 2


def should_revise(state: AgentState) -> str:
    """
    Conditional edge function: determines if the draft requires revision
    or can be finalized, respecting MAX_AGENT_REVISIONS bounds.
    """
    revisions = state.get("revision_count", 0)
    final_rep = state.get("final_report", "")

    if final_rep:
        logger.info("Critic approved final report", revisions=revisions)
        return "end"

    if revisions < MAX_AGENT_REVISIONS:
        logger.info("Routing back to synthesizer for revision", current_revision=revisions)
        return "revise"

    logger.info("Max revisions reached, forcing finalization", revisions=revisions)
    return "end"


async def critic_node(state: AgentState) -> dict:
    """Review the draft report, verify citations, and decide approval or revision."""
    logger.info("Critic reviewing draft report", revision_count=state.get("revision_count", 0))

    llm = get_llm()
    prompt = CRITIC_PROMPT.format(
        question=state["original_question"],
        draft=state.get("draft_report", ""),
        evidence_count=len(state.get("gathered_evidence", []))
    )

    try:
        response_text = await llm.generate(
            prompt=prompt,
            response_schema=CritiqueResult.model_json_schema()
        )
        data = json.loads(response_text)
        is_approved = data.get("is_approved", True)
        final_report = data.get("final_report")
        feedback = data.get("revision_instructions", [])
    except Exception as e:
        logger.warning("Critic fallback parsing", error=str(e))
        is_approved = True
        final_report = state.get("draft_report", "")
        feedback = []

    current_revisions = state.get("revision_count", 0)

    if is_approved and final_report:
        return {
            "final_report": final_report,
            "revision_count": current_revisions + 1
        }
    elif current_revisions < MAX_AGENT_REVISIONS:
        return {
            "critic_feedback": feedback,
            "revision_count": current_revisions + 1,
            "final_report": ""
        }
    else:
        # Final fallback when max revisions are reached
        fallback_final = state.get("draft_report", "")
        return {
            "final_report": fallback_final,
            "revision_count": current_revisions + 1
        }
