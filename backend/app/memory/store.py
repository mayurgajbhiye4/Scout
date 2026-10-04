from typing import List, Dict, Any
from app.graph.engine import graph_engine

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
        
        if not results:
            return ["What would you like to explore today?"]
            
        recent_interactions = [f"{r['interaction'].lower()} {r['label']}" for r in results]
        interactions_text = ", ".join(recent_interactions)
        
        # Use LLM to generate personalized follow-up prompts
        from langchain_core.prompts import PromptTemplate
        prompt = PromptTemplate.from_template(
            "The user has recently interacted with these topics: {interactions}.\n"
            "Generate 3 short, thought-provoking, and distinct follow-up questions or prompts "
            "that the user might want to ask next to explore these topics further.\n"
            "Return ONLY the 3 questions, each on a new line."
        )
        chain = prompt | graph_engine.llm
        
        try:
            response = chain.invoke({"interactions": interactions_text})
            # Parse the text into a list of strings
            suggestions = [line.strip().lstrip('1234567890.-* ') for line in response.content.split('\n') if line.strip()]
            return suggestions[:3] if suggestions else ["What would you like to explore today?"]
        except Exception as e:
            print(f"Error generating curiosity prompts: {e}")
            latest = results[0]["label"]
            return [
                f"Tell me more about {latest}.",
                f"How does {latest} relate to other concepts in my graph?",
                f"What are the prerequisites for understanding {latest}?"
            ]
