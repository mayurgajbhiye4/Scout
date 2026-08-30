"""
Citation service — handles deterministic citation mapping, embedding, and verification.
"""

import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.evidence import Evidence
from app.db.models.report import Report
from app.db.models.report_citation import ReportCitation
from app.db.models.source import Source

logger = get_logger(__name__)


class CitationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_report_citations(
        self,
        report_id: UUID,
        evidence_items: list[Evidence],
        sources: list[Source],
    ) -> list[ReportCitation]:
        """
        Creates deterministic ReportCitation rows mapping citation numbers [1], [2], ...
        to concrete Source and Evidence records.
        """
        source_by_id = {str(s.id): s for s in sources}
        citations: list[ReportCitation] = []

        seen_sources: set[str] = set()
        display_order = 1

        for i, ev in enumerate(evidence_items, start=1):
            source_id_str = str(ev.source_id) if ev.source_id else None
            source_obj = source_by_id.get(source_id_str) if source_id_str else None

            # Deduplicate by source or index
            citation_key = str(display_order)
            citation = ReportCitation(
                report_id=report_id,
                source_id=source_obj.id if source_obj else None,
                citation_key=citation_key,
                display_order=display_order,
            )
            self.db.add(citation)
            citations.append(citation)
            display_order += 1

        await self.db.commit()
        logger.info("Created report citations", report_id=str(report_id), count=len(citations))
        return citations

    @staticmethod
    def format_citations_markdown(
        report_markdown: str,
        citations: list[dict[str, Any]],
    ) -> str:
        """
        Appends a deterministic '## Sources & Citations' section to the report markdown
        if one does not already exist.
        """
        if "## Sources" in report_markdown or "## References" in report_markdown:
            return report_markdown

        sources_section = "\n\n## Sources & Citations\n\n"
        for cit in citations:
            key = cit.get("citation_key") or cit.get("key", "?")
            title = cit.get("source_title") or cit.get("title") or "Source"
            url = cit.get("source_url") or cit.get("url")
            excerpt = cit.get("supporting_excerpt") or cit.get("excerpt")

            if url:
                sources_section += f"[{key}] [{title}]({url})\n"
            else:
                sources_section += f"[{key}] **{title}**\n"

            if excerpt:
                cleaned_excerpt = excerpt.strip().replace("\n", " ")
                if len(cleaned_excerpt) > 200:
                    cleaned_excerpt = cleaned_excerpt[:197] + "..."
                sources_section += f"    *Excerpt:* \"{cleaned_excerpt}\"\n\n"

        return report_markdown + sources_section

    @staticmethod
    def verify_citation_coverage(
        report_markdown: str,
        total_evidence_count: int,
    ) -> dict[str, Any]:
        """
        Deterministic metric: calculates how many citation markers [1], [2], etc.
        are referenced inside the generated report markdown.
        """
        matches = re.findall(r"\[(\d+)\]", report_markdown)
        cited_indices = {int(m) for m in matches if m.isdigit()}
        
        valid_cites = [idx for idx in cited_indices if 1 <= idx <= total_evidence_count]
        coverage_ratio = len(valid_cites) / total_evidence_count if total_evidence_count > 0 else 1.0

        return {
            "total_evidence": total_evidence_count,
            "cited_count": len(valid_cites),
            "cited_indices": sorted(list(cited_indices)),
            "coverage_ratio": round(coverage_ratio, 2),
            "is_sufficient": coverage_ratio >= 0.6 if total_evidence_count > 0 else True,
        }
