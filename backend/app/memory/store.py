import asyncio
import logging
import time
from typing import List, Dict, Any, Optional
from app.graph.engine import graph_engine

logger = logging.getLogger(__name__)

# Global in-memory prompt cache:
# user_id -> {"timestamp": float, "interactions_hash": str, "prompts": List[str]}
_PROMPTS_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 1800  # 30 minutes


def invalidate_prompts_cache(user_id: str) -> None:
    """Invalidates cached prompt suggestions for a user."""
    _PROMPTS_CACHE.pop(str(user_id), None)


def clean_concept_label(label: Optional[str]) -> str:
    """Cleans conversational prefixes, prompt wrappers, and trailing punctuation from concept labels."""
    if not label:
        return "this topic"
    cleaned = label.strip().strip('"\'`')

    # Strip common leading question / conversational wrappers iteratively
    prefixes = [
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
    changed = True
    while changed:
        changed = False
        lower = cleaned.lower()
        for p in prefixes:
            if lower.startswith(p):
                cleaned = cleaned[len(p):].strip()
                changed = True
                break

    # Strip trailing relationship question part e.g. "relate to other concepts in my graph?"
    if "relate to other concepts" in cleaned.lower():
        cleaned = cleaned.lower().split("relate to other concepts")[0].strip()

    # Clean ends
    cleaned = cleaned.strip(".?!:;,- ")
    return cleaned or label.strip().strip(".?!:;,- ")


class UserMemoryStore:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)

    def record_interaction(self, action: str, target_node_id: str, target_label: str = None, target_type: str = "Concept"):
        """
        Action can be 'LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT'.
        Links the user's root node to the target entity in the universal graph.
        """
        action_rel = action.upper().replace(" ", "_")
        target_label = target_label or target_node_id
        target_type = target_type.capitalize().replace(" ", "")

        query = f"""
        MERGE (u:User {{id: $user_id}})
        ON CREATE SET u.label = 'User', u.created_at = timestamp()
        MERGE (t:{target_type} {{id: $target_id}})
        ON CREATE SET t.label = $target_label, t.type = $target_type
        MERGE (u)-[r:{action_rel}]->(t)
        ON CREATE SET r.timestamp = timestamp()
        """
        graph_engine._execute_write(query, {
            "user_id": self.user_id,
            "target_id": target_node_id,
            "target_label": target_label,
            "target_type": target_type
        })
        # Invalidate prompt cache so next suggestions reflect the new interaction
        invalidate_prompts_cache(self.user_id)

    async def get_curiosity_map(self) -> List[Dict[str, Any]]:
        """Returns the user's connected nodes (likes, explores, curious_about) for the UI Mindmap."""
        query = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
        RETURN t.id AS id, t.label AS label, labels(t)[0] AS type, type(r) AS relationship
        ORDER BY r.timestamp DESC
        LIMIT 20
        """
        results = await asyncio.to_thread(graph_engine._execute_read, query, {"user_id": self.user_id})
        return results

    async def suggest_prompts(self, force_refresh: bool = False) -> List[str]:
        """Generates proactive prompts based on the user's latest curiosity graph with caching and async execution."""
        query = """
        MATCH (u:User {id: $user_id})-[r:EXPLORED|CURIOUS_ABOUT]->(t)
        RETURN t.label AS label, type(r) AS interaction
        ORDER BY r.timestamp DESC
        LIMIT 5
        """
        results = await asyncio.to_thread(graph_engine._execute_read, query, {"user_id": self.user_id})

        default_prompts = [
            "Synthesize recent breakthroughs in Graph RAG",
            "Compare dense retrieval vs hybrid search",
            "Analyze multi-agent reasoning workflows",
        ]

        if not results:
            return default_prompts

        recent_interactions = [
            f"{r['interaction'].lower()} {clean_concept_label(r['label'])}"
            for r in results if r.get("label")
        ]
        if not recent_interactions:
            return default_prompts

        interactions_text = ", ".join(recent_interactions)
        interactions_hash = "|".join(recent_interactions)

        # 1. Return from in-memory cache if available and fresh (<1ms)
        if not force_refresh:
            cached_entry = _PROMPTS_CACHE.get(self.user_id)
            if cached_entry:
                is_fresh = (time.time() - cached_entry.get("timestamp", 0)) < _CACHE_TTL_SECONDS
                is_same_hash = cached_entry.get("interactions_hash") == interactions_hash
                if is_fresh and is_same_hash and cached_entry.get("prompts"):
                    return cached_entry["prompts"]

        # Fast heuristic template fallback
        def get_heuristic_prompts() -> List[str]:
            latest = clean_concept_label(results[0]["label"])
            second = clean_concept_label(results[1]["label"]) if len(results) > 1 else latest
            third = clean_concept_label(results[2]["label"]) if len(results) > 2 else latest
            return [
                f"Explore real-world applications of {latest}",
                f"What are key architectural trade-offs in {second}?",
                f"How does {third} relate to other concepts in my research?",
            ]

        # 2. Use LLM asynchronously with non-blocking ainvoke and timeout
        if graph_engine.llm:
            try:
                from langchain_core.prompts import PromptTemplate
                prompt = PromptTemplate.from_template(
                    "The user has recently researched these concepts and topics: {interactions}.\n"
                    "Generate 3 short, thought-provoking, and distinct follow-up research questions or prompts "
                    "that the user might want to explore next.\n"
                    "Keep each prompt concise (under 15 words) and highly relevant.\n"
                    "Return ONLY the 3 questions, each on a new line, without numbering or bullets."
                )
                chain = prompt | graph_engine.llm

                response = await asyncio.wait_for(
                    chain.ainvoke({"interactions": interactions_text}),
                    timeout=3.5
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

                lines = [line.strip().lstrip('1234567890.-*• ') for line in content_text.split('\n') if line.strip()]
                suggestions = [l for l in lines if len(l) > 6 and not l.startswith(("{", "}", "[", "]"))]
                if suggestions and len(suggestions) >= 2:
                    prompts_result = suggestions[:3]
                    _PROMPTS_CACHE[self.user_id] = {
                        "timestamp": time.time(),
                        "interactions_hash": interactions_hash,
                        "prompts": prompts_result,
                    }
                    return prompts_result
            except Exception as e:
                logger.warning(f"Curiosity prompt LLM generation timed out or failed: {e}. Using heuristic prompts.")

        # 3. Dynamic heuristic fallback if LLM is slow, times out, or fails
        fallback = get_heuristic_prompts()
        _PROMPTS_CACHE[self.user_id] = {
            "timestamp": time.time(),
            "interactions_hash": interactions_hash,
            "prompts": fallback,
        }
        return fallback

