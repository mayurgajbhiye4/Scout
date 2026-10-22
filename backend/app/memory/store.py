import asyncio
import logging
import re
import time
from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.core.rate_limit import enforce_pipeline_rate_limit
from app.graph.engine import graph_engine

logger = logging.getLogger(__name__)

# Global in-memory prompt cache:
# user_id -> {"timestamp": float, "hash": str, "prompts": List[str]}
_PROMPTS_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 180  # 3 minutes cache for snappy responses while staying fresh


def invalidate_prompts_cache(user_id: str) -> None:
    """Invalidates cached prompt suggestions for a user."""
    _PROMPTS_CACHE.pop(str(user_id), None)


_STOP_WORDS_BOILERPLATE = {
    "hi", "hello", "hey", "who are you", "what can you do", "help me",
    "test", "testing", "2+2", "count 1, 2, 3", "count 1 2 3",
}

_BOILERPLATE_PREFIXES = [
    "extract key insights",
    "extract insights",
    "summarize this video",
    "summarize this",
    "summarize in",
    "tell me more about",
    "tell me about",
    "what are the prerequisites for understanding",
    "what are the prerequisites for",
    "what is",
    "what are",
    "how does",
    "explain to me",
    "explain",
    "explore",
    "synthesize",
    "compare",
    "analyze",
]


def clean_concept_label(label: Optional[str]) -> str:
    """Cleans conversational prefixes, prompt wrappers, and trailing punctuation from concept labels."""
    if not label:
        return ""
    cleaned = label.strip().strip('"\'`')
    # Replace unicode artifact with hyphen
    cleaned = cleaned.replace("\ufffd", "-")

    changed = True
    while changed:
        changed = False
        lower = cleaned.lower()
        for p in _BOILERPLATE_PREFIXES:
            if lower.startswith(p):
                cleaned = cleaned[len(p):].strip()
                changed = True
                break

    if "relate to other concepts" in cleaned.lower():
        cleaned = cleaned.lower().split("relate to other concepts")[0].strip()

    cleaned = cleaned.strip(".?!:;,- ")
    return cleaned


def is_valid_concept(label: Optional[str]) -> bool:
    """Validates whether a string represents a substantive concept rather than a prompt instruction or greeting."""
    if not label:
        return False
    cleaned = clean_concept_label(label)
    if len(cleaned) < 3 or len(cleaned) > 75:
        return False
    lower = cleaned.lower()
    if lower in _STOP_WORDS_BOILERPLATE:
        return False
    if any(lower.startswith(b) for b in ["who are you", "count ", "extract key", "summarize"]):
        return False
    # If it has more than 7 words, it's a sentence or question rather than a concept name
    if len(cleaned.split()) > 7:
        return False
    return True


def clean_source_title(title: Optional[str]) -> str:
    """Produces a clean, displayable title from a source/document name."""
    if not title:
        return "Recent Document"
    cleaned = title.strip().replace("\ufffd", "-")
    # If GitHub repo format user/repo -> repo
    if "/" in cleaned and len(cleaned.split("/")) == 2 and not cleaned.startswith("http"):
        parts = cleaned.split("/")
        return parts[1]
    # Strip URL domain if raw URL
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned.split("/")[-1] or cleaned
    # Trim trailing parentheticals if too long
    if len(cleaned) > 45:
        cleaned = cleaned[:45].rstrip(" -:,") + "..."
    return cleaned


class UserMemoryStore:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)

    def cleanup_legacy_query_nodes(self):
        """Cleans up legacy query_ nodes and non-concept junk from the Neo4j graph."""
        query = """
        MATCH (t)
        WHERE t.id STARTS WITH 'query_'
           OR (t.label IS NOT NULL AND t.label =~ '(?i)^(who are you|hi|hello|test|count .*|summarize .*|extract key .*|2\\+2.*)$')
        DETACH DELETE t
        """
        try:
            graph_engine._execute_write(query)
        except Exception as e:
            logger.debug(f"Failed to cleanup legacy query nodes: {e}")

    def record_interaction(
        self,
        action: str,
        target_node_id: str,
        target_label: str = None,
        target_type: str = "Concept"
    ):
        """
        Action can be 'LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT'.
        Links the user's root node to the target entity in the universal graph.
        """
        action_rel = action.upper().replace(" ", "_")
        target_label = target_label or target_node_id
        target_type = target_type.capitalize().replace(" ", "")

        # Validate concept to avoid polluting the graph with chat sentences
        if target_type == "Concept" and not is_valid_concept(target_label):
            return

        query = f"""
        MERGE (u:User {{id: $user_id}})
        ON CREATE SET u.label = 'User', u.created_at = timestamp()
        MERGE (t:{target_type} {{id: $target_id}})
        ON CREATE SET t.label = $target_label, t.type = $target_type, t.created_at = timestamp()
        ON MATCH SET t.label = coalesce($target_label, t.label)
        MERGE (u)-[r:{action_rel}]->(t)
        SET r.timestamp = timestamp()
        """
        graph_engine._execute_write(query, {
            "user_id": self.user_id,
            "target_id": target_node_id,
            "target_label": target_label,
            "target_type": target_type
        })
        invalidate_prompts_cache(self.user_id)

    def record_chat_interaction(
        self,
        user_query: str,
        session_id: Optional[str] = None,
        assistant_reply: Optional[str] = None
    ):
        """
        Smartly records chat interaction in the user's graph:
        1. Avoids conversational noise ("hi", "who are you", etc.).
        2. Detects mentions of existing knowledge graph concepts and connects them.
        3. If attached sources exist, connects EXPLORED to the source documents.
        """
        if not user_query or not graph_engine.driver:
            return

        query_cleaned = user_query.strip()
        lower_query = query_cleaned.lower()

        # Ignore pure filler / test prompts
        if lower_query in _STOP_WORDS_BOILERPLATE or any(lower_query.startswith(p) for p in ["who are you", "count 1"]):
            return

        # 1. Match query against existing Knowledge Graph concepts/entities for this user
        match_query = """
        MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
        WHERE n.label IS NOT NULL AND length(n.label) > 2
        RETURN DISTINCT n.id AS id, n.label AS label, labels(n)[0] AS type
        LIMIT 50
        """
        try:
            entities = graph_engine._execute_read(match_query, {"user_id": self.user_id})
            matched_nodes = []
            for ent in entities:
                lbl = ent.get("label", "")
                if lbl and len(lbl) > 2 and lbl.lower() in lower_query:
                    matched_nodes.append(ent)

            for m in matched_nodes[:3]:
                self.record_interaction(
                    action="EXPLORED",
                    target_node_id=m["id"],
                    target_label=m["label"],
                    target_type=m.get("type", "Concept")
                )
        except Exception as e:
            logger.debug(f"Chat concept matching failed: {e}")

        invalidate_prompts_cache(self.user_id)

    async def get_curiosity_map(self) -> List[Dict[str, Any]]:
        """Returns the user's connected nodes (likes, explores, curious_about) for the UI Mindmap."""
        query = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
          AND NOT t.id STARTS WITH 'query_'
          AND NOT (t.label =~ '(?i)^(who are you|hi|hello|count .*|what is .*|tell me .*|explore .*|extract key .*|2\\+2.*)$')
        RETURN t.id AS id, t.label AS label, labels(t)[0] AS type, type(r) AS relationship
        ORDER BY coalesce(r.timestamp, 0) DESC
        LIMIT 20
        """
        results = await asyncio.to_thread(graph_engine._execute_read, query, {"user_id": self.user_id})
        # Clean labels
        cleaned = []
        for r in (results or []):
            lbl = clean_concept_label(r.get("label"))
            if is_valid_concept(lbl):
                r["label"] = lbl
                cleaned.append(r)
        return cleaned

    async def suggest_prompts(self, force_refresh: bool = False) -> List[str]:
        """
        Generates proactive prompts by deeply exploring the user's Knowledge Graph:
        - Prioritizes the user's latest 5 to 10 ingested sources (EXTRACTED_FROM, MENTIONS).
        - Traverses semantic connections (RELATES_TO).
        - Incorporates active interests (CURIOUS_ABOUT, LIKES, EXPLORED).
        - Always queries fresh data from the Graph DB to avoid stale prompts.
        """
        # Cleanup legacy query_ nodes if present
        await asyncio.to_thread(self.cleanup_legacy_query_nodes)

        # 1. Query the user's latest 5 to 10 ingested sources with their mentioned entities and relationships
        q_sources = """
        MATCH (u:User {id: $user_id})<-[r:EXTRACTED_FROM]-(d:Document)
        OPTIONAL MATCH (d)-[:MENTIONS]->(n)
        OPTIONAL MATCH (n)-[:RELATES_TO]-(rel)
        WITH d, r,
             collect(DISTINCT n.label)[0..6] AS entities,
             collect(DISTINCT rel.label)[0..4] AS related
        ORDER BY coalesce(r.timestamp, d.created_at, 0) DESC
        LIMIT 10
        RETURN d.id AS doc_id, d.title AS title,
               coalesce(r.timestamp, d.created_at, 0) AS ts,
               entities, related
        """

        # 2. Query active user interests and explored nodes
        q_interactions = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['CURIOUS_ABOUT', 'LIKES', 'EXPLORED']
          AND NOT t:Document
          AND NOT t.id STARTS WITH 'query_'
          AND NOT (t.label =~ '(?i)^(who are you|hi|hello|count .*|what is .*|tell me .*|explore .*|extract key .*|2\\+2.*)$')
        OPTIONAL MATCH (t)-[:RELATES_TO]-(neighbor)
        RETURN type(r) AS rel, t.label AS label, labels(t)[0] AS type,
               coalesce(r.timestamp, 0) AS ts,
               collect(DISTINCT neighbor.label)[0..3] AS related
        ORDER BY ts DESC
        LIMIT 8
        """

        # 3. Query cross-entity semantic relationships in user's ingested sources
        q_relationships = """
        MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(a)
        MATCH (a)-[rel:RELATES_TO]->(b)
        WHERE a.label IS NOT NULL AND b.label IS NOT NULL AND a.label <> b.label
        RETURN a.label AS source, labels(a)[0] AS source_type,
               b.label AS target, labels(b)[0] AS target_type,
               d.title AS doc_title
        LIMIT 12
        """

        # Execute graph reads in parallel
        sources_res, interactions_res, rels_res = await asyncio.gather(
            asyncio.to_thread(graph_engine._execute_read, q_sources, {"user_id": self.user_id}),
            asyncio.to_thread(graph_engine._execute_read, q_interactions, {"user_id": self.user_id}),
            asyncio.to_thread(graph_engine._execute_read, q_relationships, {"user_id": self.user_id}),
        )

        default_prompts = [
            "Synthesize recent breakthroughs in Graph RAG",
            "Compare dense retrieval vs hybrid search",
            "Analyze multi-agent reasoning workflows",
        ]

        if not sources_res and not interactions_res and not rels_res:
            return default_prompts

        # Build dynamic hash to verify freshness
        sources_sig = "|".join([f"{s.get('doc_id')}:{s.get('ts')}" for s in (sources_res or [])])
        interactions_sig = "|".join([f"{i.get('label')}:{i.get('rel')}" for i in (interactions_res or [])])
        graph_hash = f"{sources_sig}::{interactions_sig}"

        # Check cache unless force_refresh is requested
        if not force_refresh:
            cached = _PROMPTS_CACHE.get(self.user_id)
            if cached:
                is_fresh = (time.time() - cached.get("timestamp", 0)) < _CACHE_TTL_SECONDS
                is_same_hash = cached.get("hash") == graph_hash
                if is_fresh and is_same_hash and cached.get("prompts"):
                    return cached["prompts"]

        # ── Smart Heuristic Fallback Function ───────────────────────────
        def generate_heuristic_prompts() -> List[str]:
            prompts = []
            
            # 1. From latest ingested sources
            valid_sources = [s for s in (sources_res or []) if s.get("title")]
            if valid_sources:
                latest_doc = valid_sources[0]
                doc_title = clean_source_title(latest_doc.get("title"))
                entities = [clean_concept_label(e) for e in latest_doc.get("entities", []) if is_valid_concept(e)]
                
                if entities:
                    prompts.append(f"How is {entities[0]} architected in {doc_title}?")
                else:
                    prompts.append(f"Key architectural patterns and insights from {doc_title}")

                if len(valid_sources) > 1:
                    second_doc = valid_sources[1]
                    doc2_title = clean_source_title(second_doc.get("title"))
                    entities2 = [clean_concept_label(e) for e in second_doc.get("entities", []) if is_valid_concept(e)]
                    if entities2:
                        prompts.append(f"Analyze trade-offs of {entities2[0]} in {doc2_title}")
                    else:
                        prompts.append(f"Explore core takeaways and methodology from {doc2_title}")

            # 2. From cross-concept RELATES_TO edges
            valid_rels = [
                r for r in (rels_res or [])
                if is_valid_concept(r.get("source")) and is_valid_concept(r.get("target"))
            ]
            if valid_rels:
                rel = valid_rels[0]
                src = clean_concept_label(rel["source"])
                tgt = clean_concept_label(rel["target"])
                prompts.append(f"How does {src} connect to {tgt} in your research?")
                if len(valid_rels) > 1 and len(prompts) < 3:
                    rel2 = valid_rels[1]
                    s2 = clean_concept_label(rel2["source"])
                    t2 = clean_concept_label(rel2["target"])
                    prompts.append(f"Compare implementation strategies: {s2} vs {t2}")

            # 3. From active user interests (LIKES, CURIOUS_ABOUT, EXPLORED)
            valid_interests = [
                i for i in (interactions_res or [])
                if is_valid_concept(i.get("label"))
            ]
            if valid_interests and len(prompts) < 3:
                top_interest = clean_concept_label(valid_interests[0]["label"])
                prompts.append(f"Explore emerging breakthroughs and applications in {top_interest}")

            # Fill remaining with defaults if still under 3
            idx = 0
            while len(prompts) < 3 and idx < len(default_prompts):
                if default_prompts[idx] not in prompts:
                    prompts.append(default_prompts[idx])
                idx += 1

            return prompts[:4]

        # ── LLM-Powered Generation (with generous timeout & rich context) ──
        if graph_engine.llm:
            try:
                enforce_pipeline_rate_limit(
                    scope="pipeline:llm",
                    limit=settings.PIPELINE_LLM_RPM,
                    window=60,
                    identifier=self.user_id,
                    description="Curiosity prompt suggestions LLM generation",
                )
                # Prepare rich context sections
                sources_context = []
                for s in (sources_res or [])[:8]:
                    t = clean_source_title(s.get("title"))
                    ents = [clean_concept_label(e) for e in s.get("entities", []) if is_valid_concept(e)]
                    ents_str = f" (Key entities: {', '.join(ents[:4])})" if ents else ""
                    sources_context.append(f"- Source: '{t}'{ents_str}")

                rels_context = []
                for r in (rels_res or [])[:8]:
                    s = clean_concept_label(r.get("source"))
                    t = clean_concept_label(r.get("target"))
                    if is_valid_concept(s) and is_valid_concept(t):
                        rels_context.append(f"- {s} relates to {t}")

                interests_context = []
                for i in (interactions_res or [])[:6]:
                    lbl = clean_concept_label(i.get("label"))
                    rel = i.get("rel", "EXPLORED").replace("_", " ").lower()
                    if is_valid_concept(lbl):
                        interests_context.append(f"- User {rel}: '{lbl}'")

                prompt_input = (
                    "The user has ingested sources and explored concepts in their personal research knowledge graph.\n\n"
                    "LATEST INGESTED SOURCES (most recent first):\n"
                    f"{chr(10).join(sources_context) if sources_context else 'None'}\n\n"
                    "KEY CONNECTED RELATIONSHIPS (RELATES_TO):\n"
                    f"{chr(10).join(rels_context) if rels_context else 'None'}\n\n"
                    "ACTIVE USER INTERESTS & RECENT TOPICS:\n"
                    f"{chr(10).join(interests_context) if interests_context else 'None'}\n\n"
                    "TASK: Generate 3 to 4 natural, thought-provoking, and concise research exploration prompts (under 13 words each) "
                    "that the user might want to explore next.\n"
                    "CRITICAL RULES:\n"
                    "1. Heavily prioritize their latest ingested sources and cross-entity relationships (e.g. trade-offs, synthesis, mechanisms).\n"
                    "2. DO NOT concatenate templates with entire sentences. Prompts must be fluid, specific, and grammatically complete.\n"
                    "3. DO NOT include phrases like 'who are you', 'tell me about', or echo raw URLs.\n"
                    "4. Return ONLY the 3-4 prompts, one per line, with no bullets, numbers, or quotes."
                )

                response = await asyncio.wait_for(
                    graph_engine.llm.ainvoke(prompt_input),
                    timeout=10.0
                )

                content_text = ""
                if isinstance(response.content, list):
                    for part in response.content:
                        if isinstance(part, dict):
                            content_text += part.get("text", "")
                        elif hasattr(part, "text"):
                            content_text += part.text
                        else:
                            content_text += str(part)
                else:
                    content_text = str(response.content)

                lines = [
                    re.sub(r'^[0-9\.\-\*\•\s]+', '', line).strip().strip('"\'`')
                    for line in content_text.split('\n')
                    if line.strip()
                ]
                valid_suggestions = [
                    l for l in lines
                    if len(l) > 10 and not l.startswith(("{", "}", "[", "]")) and not l.lower().startswith("here are")
                ]

                if len(valid_suggestions) >= 2:
                    prompts_result = valid_suggestions[:4]
                    _PROMPTS_CACHE[self.user_id] = {
                        "timestamp": time.time(),
                        "hash": graph_hash,
                        "prompts": prompts_result,
                    }
                    return prompts_result

            except Exception as e:
                logger.warning(f"Knowledge Graph prompt LLM generation timed out or failed: {e}. Using smart heuristic generator.")

        # Heuristic fallback if LLM times out or is offline
        fallback = generate_heuristic_prompts()
        _PROMPTS_CACHE[self.user_id] = {
            "timestamp": time.time(),
            "hash": graph_hash,
            "prompts": fallback,
        }
        return fallback
