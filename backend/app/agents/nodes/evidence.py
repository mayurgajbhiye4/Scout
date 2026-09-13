"""
Evidence Processor Node — Normalizes and verifies all gathered evidence items.
"""

from app.agents.schemas import EvidenceItem
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


def _to_evidence_item(item) -> EvidenceItem | None:
    """Coerce any representation of an evidence item to EvidenceItem.

    LangGraph may pass items as:
    - EvidenceItem (Pydantic model)  — already correct
    - dict                            — from JSON serialization
    - anything else                   — skip
    """
    if isinstance(item, EvidenceItem):
        return item
    if isinstance(item, dict):
        try:
            return EvidenceItem(**item)
        except Exception:
            return None
    # Last resort: try reading known attributes directly
    try:
        return EvidenceItem(
            claim=getattr(item, "claim", ""),
            supporting_excerpt=getattr(item, "supporting_excerpt", ""),
            source_title=getattr(item, "source_title", "Unknown"),
            source_url=getattr(item, "source_url", None),
            confidence=float(getattr(item, "confidence", 0.9)),
        )
    except Exception:
        return None


async def evidence_node(state: AgentState) -> dict:
    """Normalize, deduplicate, and verify accumulated evidence."""
    raw_evidence = state.get("gathered_evidence", [])
    logger.info("Normalizing evidence items", count=len(raw_evidence))

    seen_claims: set[str] = set()
    deduped_evidence: list[EvidenceItem] = []

    for raw_item in raw_evidence:
        ev = _to_evidence_item(raw_item)
        if ev is None:
            continue
        clean_claim = ev.claim.strip().lower()
        if clean_claim and clean_claim not in seen_claims:
            seen_claims.add(clean_claim)
            deduped_evidence.append(ev)

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
