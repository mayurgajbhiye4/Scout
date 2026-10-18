"""Session service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import uuid
from typing import List, Optional

from app.db.models.research_session import ResearchSession
from app.schemas.sessions import SessionCreate, SessionUpdate

async def get_user_sessions(db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 20) -> List[ResearchSession]:
    from sqlalchemy.orm import selectinload
    from app.db.models.session_source import SessionSource
    stmt = (
        select(ResearchSession)
        .where(ResearchSession.user_id == user_id)
        .options(selectinload(ResearchSession.session_sources).selectinload(SessionSource.source))
        .order_by(ResearchSession.last_activity_at.desc(), ResearchSession.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    for s in sessions:
        s.sources = [ss.source for ss in s.session_sources if ss.source]
    return sessions

async def get_session(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> Optional[ResearchSession]:
    from sqlalchemy.orm import selectinload
    from app.db.models.session_source import SessionSource
    stmt = (
        select(ResearchSession)
        .where(ResearchSession.id == session_id, ResearchSession.user_id == user_id)
        .options(selectinload(ResearchSession.session_sources).selectinload(SessionSource.source))
    )
    result = await db.execute(stmt)
    session = result.scalars().first()
    if session:
        session.sources = [ss.source for ss in session.session_sources if ss.source]
    return session

async def create_session(db: AsyncSession, session_in: SessionCreate, user_id: uuid.UUID) -> ResearchSession:
    session = ResearchSession(
        user_id=user_id,
        title=session_in.title or "New Session",
        mode=session_in.mode,
        source_policy=session_in.source_policy,
        last_activity_at=datetime.utcnow()
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    if session_in.source_ids:
        from app.db.models.session_source import SessionSource
        for sid in session_in.source_ids:
            session_source = SessionSource(session_id=session.id, source_id=sid)
            db.add(session_source)
        await db.commit()

    return session

async def update_session(db: AsyncSession, session_id: uuid.UUID, session_in: SessionUpdate, user_id: uuid.UUID) -> Optional[ResearchSession]:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return None
    if session_in.title is not None:
        session.title = session_in.title
    if session_in.session_summary is not None:
        session.session_summary = session_in.session_summary
    if session_in.status is not None:
        session.status = session_in.status
    if session_in.source_policy is not None:
        session.source_policy = session_in.source_policy
    session.last_activity_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    return session

async def get_session_sources(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> List:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return []
    return session.sources or []

async def add_source_to_session(db: AsyncSession, session_id: uuid.UUID, source_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return False
    from app.db.models.session_source import SessionSource
    stmt = select(SessionSource).where(SessionSource.session_id == session_id, SessionSource.source_id == source_id)
    res = await db.execute(stmt)
    if not res.scalars().first():
        db.add(SessionSource(session_id=session_id, source_id=source_id))
        await db.commit()
    return True

async def remove_source_from_session(db: AsyncSession, session_id: uuid.UUID, source_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return False
    from app.db.models.session_source import SessionSource
    stmt = select(SessionSource).where(SessionSource.session_id == session_id, SessionSource.source_id == source_id)
    res = await db.execute(stmt)
    ss = res.scalars().first()
    if ss:
        await db.delete(ss)
        await db.commit()
    return True

async def delete_session(db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    session = await get_session(db, session_id=session_id, user_id=user_id)
    if not session:
        return False
    await db.delete(session)
    await db.commit()
    return True

def clean_fallback_title(prompt: str, source_titles: Optional[List[str]] = None) -> str:
    """Fast algorithmic title cleaner if LLM is unavailable."""
    import re
    if source_titles and len(source_titles) > 0 and source_titles[0]:
        st = source_titles[0].strip()
        if len(st) <= 32:
            return f"{st} Analysis" if not any(w in st.lower() for w in ["analysis", "summary", "guide"]) else st
        return st[:32].rsplit(' ', 1)[0]
    
    clean = prompt.strip()
    clean = re.sub(r'https?://\S+', '', clean).strip()
    
    patterns = [
        r'^(extract key insights,?\s*chapters,?\s*and fact-check arguments from this lecture video:?\s*)',
        r'^(synthesize methodology and empirical conclusions from the uploaded pdf paper\.?\s*)',
        r'^(analyze repository architecture and summarize technical design tradeoffs:?\s*)',
        r'^(index this documentation site and explain core api patterns:?\s*)',
        r'^(identify emerging breakthroughs and paradigm shifts in\s*)',
        r'^(synthesize consensus and conflicting findings across\s*)',
        r'^(summarize this video in \d+ lines?:?\s*)',
        r'^(summarize this in \d+ lines?:?\s*)',
        r'^(can you please explain to me\s*)',
        r'^(can you explain to me\s*)',
        r'^(can you explain\s*)',
        r'^(tell me more about\s*)',
        r'^(what is\s*)',
        r'^(how does\s*)',
        r'^(explain\s*)',
    ]
    for p in patterns:
        clean = re.sub(p, '', clean, flags=re.IGNORECASE).strip()

    if not clean:
        return "Research Discussion"

    if len(clean) > 36:
        truncated = clean[:36].rsplit(' ', 1)[0]
        clean = truncated if truncated else clean[:36]

    clean = clean.strip(' :,-.?!')
    words = clean.split()
    capitalized = " ".join([
        w.capitalize() if w.lower() not in ("a", "an", "the", "and", "or", "in", "on", "of", "to", "for", "with", "vs") or i == 0 else w.lower()
        for i, w in enumerate(words)
    ])
    return capitalized or "Research Session"

async def generate_session_title_and_summary(
    user_query: str,
    assistant_response: str = "",
    source_titles: Optional[List[str]] = None,
) -> dict[str, str]:
    """Generate a brief 3-6 word summary title and 1-2 sentence summary for a chat session."""
    import json
    import logging
    from app.core.config import settings
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import HumanMessage
    
    logger = logging.getLogger(__name__)

    try:
        llm = ChatGoogleGenerativeAI(
            model=settings.LLM_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0.2,
        )
        sources_str = ", ".join(source_titles) if source_titles else "None"
        prompt = f"""You are an expert at creating concise, insightful titles and summaries for research chat sessions.
Given the information below:
USER QUERY: {user_query[:500]}
ASSISTANT ANSWER SNIPPET: {assistant_response[:600]}
ATTACHED SOURCES: {sources_str}

Please generate a JSON object with:
1. "title": A brief, specific title (3 to 6 words maximum, strictly under 40 characters). It must capture the core topic/subject of the chat, NOT generic phrases like 'Video Summary', 'Chat Session', 'Research Request', or raw user commands. Do NOT use quotes inside the title.
2. "summary": A crisp, professional 1-2 sentence summary explaining what was discussed, analyzed, or concluded in this session.

Return ONLY a valid JSON object matching: {{"title": "...", "summary": "..."}}
"""
        res = await llm.ainvoke([HumanMessage(content=prompt)])
        content = res.content
        raw_text = ""
        if isinstance(content, str):
            raw_text = content
        elif isinstance(content, list):
            for p in content:
                if isinstance(p, dict) and p.get("text"):
                    raw_text += p["text"]
                elif isinstance(p, str):
                    raw_text += p
        
        clean_json_str = raw_text.strip()
        if "```json" in clean_json_str:
            clean_json_str = clean_json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json_str:
            clean_json_str = clean_json_str.split("```")[1].split("```")[0].strip()

        data = json.loads(clean_json_str)
        title = data.get("title", "").strip().strip('"').strip("'")
        summary = data.get("summary", "").strip()
        if title:
            if len(title) > 42:
                title = title[:42].rsplit(' ', 1)[0].strip()
            return {"title": title, "summary": summary}
    except Exception as e:
        logger.warning(f"LLM title/summary generation failed: {e}")

    fallback_title = clean_fallback_title(user_query, source_titles)
    fallback_summary = f"Discussion and analysis focused on {fallback_title.lower()}."
    return {"title": fallback_title, "summary": fallback_summary}

async def update_session_summary_and_title(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_query: str,
    assistant_response: str = "",
    source_titles: Optional[List[str]] = None,
) -> Optional[dict[str, str]]:
    """Generate and persist brief title and summary for a session."""
    stmt = select(ResearchSession).where(ResearchSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        return None

    is_default_title = (
        not session.title
        or session.title in ("New Session", "Research Session", "Untitled Session")
        or session.title == user_query[:45]
        or len(session.title) > 45
        or session.title.lower().startswith("summarize this")
        or session.title.lower().startswith("extract key insights")
        or session.title.lower().startswith("synthesize methodology")
        or session.title.endswith("...")
        or not session.session_summary
    )

    if not is_default_title and session.session_summary:
        return {"title": session.title, "summary": session.session_summary}

    info = await generate_session_title_and_summary(user_query, assistant_response, source_titles)
    if info.get("title"):
        session.title = info["title"]
    if info.get("summary"):
        session.session_summary = info["summary"]

    await db.commit()
    await db.refresh(session)
    return info


