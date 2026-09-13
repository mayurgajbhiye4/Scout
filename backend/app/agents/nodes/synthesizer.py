"""
Synthesizer Node — Generates comprehensive, cited Markdown research reports.
"""

from app.agents.llm.factory import get_llm
from app.agents.nodes.evidence import _to_evidence_item
from app.agents.prompts import SYNTHESIZER_PROMPT
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def synthesizer_node(state: AgentState) -> dict:
    """Draft the research report from gathered evidence and contradiction notes."""
    evidence_list = state.get("gathered_evidence", [])
    contradictions_list = state.get("contradictions", [])
    logger.info(
        "Synthesizing draft report",
        evidence_count=len(evidence_list),
        contradiction_count=len(contradictions_list),
        revision_count=state.get("revision_count", 0)
    )

    # Format evidence into explicit numbered blocks for citation referencing
    evidence_text = ""
    for i, raw_ev in enumerate(evidence_list, start=1):
        ev = _to_evidence_item(raw_ev)
        if ev is None:
            continue
        evidence_text += f"[{i}] Claim: {ev.claim}\n    Source: {ev.source_title}\n    Excerpt: \"{ev.supporting_excerpt}\"\n\n"

    # Format contradictions
    contradictions_text = ""
    for c in contradictions_list:
        claim_a = getattr(c, "claim_a", "")
        claim_b = getattr(c, "claim_b", "")
        resolution = getattr(c, "resolution_note", "")
        contradictions_text += f"- Conflict between '{claim_a}' and '{claim_b}'. Nuance/Resolution: {resolution}\n"

    if not contradictions_text:
        contradictions_text = "No severe contradictions detected; findings across sources are aligned."

    llm = get_llm()
    prompt = SYNTHESIZER_PROMPT.format(
        question=state["original_question"],
        evidence_text=evidence_text or "[Standard baseline architectural context]",
        contradictions_text=contradictions_text
    )

    draft = await llm.generate(prompt=prompt)

    return {
        "draft_report": draft
    }
