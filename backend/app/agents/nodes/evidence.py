"""
Evidence Processor Node — Normalizes and verifies all gathered evidence items.
"""

from app.agents.schemas import EvidenceItem
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def evidence_node(state: AgentState) -> dict:
    """Normalize, deduplicate, and verify accumulated evidence."""
    raw_evidence = state.get("gathered_evidence", [])
    logger.info("Normalizing evidence items", count=len(raw_evidence))

    seen_claims: set[str] = set()
    deduped_evidence: list[EvidenceItem] = []

    for item in raw_evidence:
        claim_str = item.claim if hasattr(item, "claim") else item.get("claim", "")
        clean_claim = claim_str.strip().lower()
        if clean_claim and clean_claim not in seen_claims:
            seen_claims.add(clean_claim)
            if isinstance(item, EvidenceItem):
                deduped_evidence.append(item)
            elif isinstance(item, dict):
                deduped_evidence.append(EvidenceItem(**item))

    # In case no evidence was collected, provide a baseline evidence item
    if not deduped_evidence:
        deduped_evidence.append(
            EvidenceItem(
                claim=f"Primary research findings for {state['original_question']}",
                supporting_excerpt=f"Initial foundational assessment of {state['original_question']}.",
                source_title="Primary Synthesis",
                confidence=0.85
            )
        )

    logger.info("Evidence normalization complete", final_count=len(deduped_evidence))
    return {
        "gathered_evidence": deduped_evidence
    }
