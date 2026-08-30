"""
Background job to execute the LangGraph workflow.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import research_graph
from app.core.logging import get_logger
from app.db.models.evidence import Evidence
from app.db.models.report import Report
from app.db.models.research_session import ResearchSession
from app.db.models.source import Source
from app.services.citation_service import CitationService

logger = get_logger(__name__)


async def execute_research_job(db: AsyncSession, session_id: str) -> None:
    """Executes the LangGraph research workflow for a given session."""
    
    # 1. Fetch session
    session: ResearchSession = await db.get(ResearchSession, session_id)
    if not session:
        logger.error("Research session not found for execution", session_id=session_id)
        return
        
    logger.info("Starting research execution", session_id=session_id)
    
    try:
        session.status = "planning"
        session.started_at = datetime.now(timezone.utc)
        await db.commit()
        
        # 2. Initialize AgentState
        initial_state = {
            "session_id": str(session.id),
            "workspace_id": str(session.workspace_id),
            "original_question": session.question,
            "research_depth": session.research_depth,
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
        
        # 3. Invoke LangGraph
        session.status = "researching"
        await db.commit()
        
        final_state = await research_graph.ainvoke(initial_state)
        
        session.status = "finalizing"
        await db.commit()
        
        # 4. Save Evidence
        created_evidence_items: list[Evidence] = []
        for ev_data in final_state.get("gathered_evidence", []):
            claim = getattr(ev_data, "claim", ev_data.get("claim", ""))
            excerpt = getattr(ev_data, "supporting_excerpt", ev_data.get("supporting_excerpt", ""))
            confidence = getattr(ev_data, "confidence", ev_data.get("confidence", 0.9))
            
            evidence = Evidence(
                research_session_id=session.id,
                claim=claim,
                supporting_excerpt=excerpt,
                confidence=confidence
            )
            db.add(evidence)
            created_evidence_items.append(evidence)
            
        await db.flush()

        # 5. Save Report
        report_content = final_state.get("final_report") or final_state.get("draft_report") or "Failed to generate report."
        
        report = Report(
            research_session_id=session.id,
            title=f"Research: {session.question[:50]}...",
            content_markdown=report_content
        )
        db.add(report)
        await db.flush()

        # 6. Build Deterministic Citations
        sources_res = await db.execute(
            select(Source).where(Source.workspace_id == session.workspace_id)
        )
        workspace_sources = list(sources_res.scalars().all())

        citation_service = CitationService(db)
        await citation_service.create_report_citations(
            report_id=report.id,
            evidence_items=created_evidence_items,
            sources=workspace_sources,
        )

        # 7. Finalize
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Research execution completed", session_id=session_id)
        
    except Exception as e:
        logger.error("Research execution failed", session_id=session_id, error=str(e))
        session.status = "failed"
        session.error_message = str(e)
        session.completed_at = datetime.now(timezone.utc)
        await db.commit()
