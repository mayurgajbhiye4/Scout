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
        RETURN t.label AS label
        ORDER BY r.timestamp DESC
        LIMIT 1
        """
        results = graph_engine._execute_read(query, {"user_id": self.user_id})
        
        if not results:
            return ["What would you like to explore today?"]
            
        latest = results[0]["label"]
        return [
            f"Tell me more about {latest}.",
            f"How does {latest} relate to other concepts in my graph?",
            f"What are the prerequisites for understanding {latest}?"
        ]
