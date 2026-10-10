from typing import List, Dict, Any, Optional
from app.graph.engine import graph_engine


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
        self.user_id = user_id
        # Ensure the user exists in Neo4j on initialization
        graph_engine.ensure_user_node(self.user_id)

    def record_interaction(self, action: str, target_node_id: str, target_label: str = None, target_type: str = "Concept"):
        """
        Action can be 'LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT'.
        Links the user's root node to the target entity in the universal graph.
        """
        action_rel = action.upper().replace(" ", "_")
        target_label = target_label or target_node_id
        target_type = target_type.capitalize().replace(" ", "")

        query = f"""
        MATCH (u:User {{id: $user_id}})
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

    def get_curiosity_map(self) -> List[Dict[str, Any]]:
        """Returns the user's connected nodes (likes, explores, curious_about) for the UI Mindmap."""
        query = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
        RETURN t.id AS id, t.label AS label, labels(t)[0] AS type, type(r) AS relationship
        ORDER BY r.timestamp DESC
        LIMIT 20
        """
        results = graph_engine._execute_read(query, {"user_id": self.user_id})
        return results

    def suggest_prompts(self) -> List[str]:
        """Generates proactive prompts based on the user's latest curiosity graph."""
        query = """
        MATCH (u:User {id: $user_id})-[r:EXPLORED|CURIOUS_ABOUT]->(t)
        RETURN t.label AS label, type(r) AS interaction
        ORDER BY r.timestamp DESC
        LIMIT 5
        """
        results = graph_engine._execute_read(query, {"user_id": self.user_id})

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

        # Use LLM to generate personalized follow-up prompts
        from langchain_core.prompts import PromptTemplate
        prompt = PromptTemplate.from_template(
            "The user has recently researched these concepts and topics: {interactions}.\n"
            "Generate 3 short, thought-provoking, and distinct follow-up research questions or prompts "
            "that the user might want to explore next.\n"
            "Keep each prompt concise (under 15 words) and highly relevant.\n"
            "Return ONLY the 3 questions, each on a new line, without numbering or bullets."
        )
        chain = prompt | graph_engine.llm

        try:
            response = chain.invoke({"interactions": interactions_text})
            # Robustly parse response text whether content is list or string
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
            if suggestions:
                return suggestions[:3]
        except Exception as e:
            print(f"Error generating curiosity prompts: {e}")

        # Fallback if LLM invocation fails or returns empty:
        latest = clean_concept_label(results[0]["label"])
        return [
            f"Explore real-world applications of {latest}",
            f"How does {latest} relate to other concepts in my graph?",
            f"What are the key technical trade-offs in {latest}?",
        ]

