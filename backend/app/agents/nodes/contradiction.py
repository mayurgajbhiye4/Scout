"""
Contradiction Node — Detects conflicting claims, opposing metrics, or architectural nuances.
"""

import json
from app.agents.llm.factory import get_llm
from app.agents.nodes.evidence import _to_evidence_item
from app.agents.prompts import CONTRADICTION_PROMPT
from app.agents.schemas import ContradictionAnalysisResult, ContradictionItem
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def contradiction_node(state: AgentState) -> dict:
    """Analyze evidence across sources to identify disagreements and trade-offs."""
    evidence_list = state.get("gathered_evidence", [])
    logger.info("Analyzing evidence for contradictions and nuances", evidence_count=len(evidence_list))

    if len(evidence_list) < 2:
        return {"contradictions": []}

    evidence_formatted = "\n".join([
        f"[{i+1}] {ev.claim} (Source: {ev.source_title})"
        for i, raw in enumerate(evidence_list)
        if (ev := _to_evidence_item(raw)) is not None
    ])

    llm = get_llm()
    prompt = CONTRADICTION_PROMPT.format(evidence_items=evidence_formatted)

    try:
        response_text = await llm.generate(
            prompt=prompt,
            response_schema=ContradictionAnalysisResult.model_json_schema()
        )
        data = json.loads(response_text)
        contradictions_raw = data.get("contradictions", [])
        contradictions = [ContradictionItem(**c) for c in contradictions_raw]
    except Exception as e:
        logger.warning("Contradiction analysis fallback", error=str(e))
        contradictions = []

    logger.info("Contradiction detection complete", detected=len(contradictions))
    return {
        "contradictions": contradictions
    }
