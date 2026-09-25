import os
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from pydantic import BaseModel
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

class Node(BaseModel):
    id: str
    label: str
    type: str

class Edge(BaseModel):
    source: str
    target: str
    relationship: str

class GraphExtractionResult(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class Neo4jGraphEngine:
    def __init__(self):
        # Read from environment variables, fallback to defaults
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "password")
        
        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            self.driver.verify_connectivity()
            print("Connected to Neo4j successfully.")
        except Exception as e:
            print(f"Failed to connect to Neo4j: {e}. Ensure Neo4j is running.")
            self.driver = None

        self.llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

    def close(self):
        if self.driver:
            self.driver.close()

    def _execute_write(self, query: str, parameters: Dict[str, Any] = None):
        if not self.driver:
            return None
        with self.driver.session() as session:
            return session.execute_write(lambda tx: tx.run(query, parameters).data())

    def _execute_read(self, query: str, parameters: Dict[str, Any] = None):
        if not self.driver:
            return []
        with self.driver.session() as session:
            return session.execute_read(lambda tx: tx.run(query, parameters).data())

    def ensure_user_node(self, user_id: str):
        """Creates the root User node for the Universal User Graph."""
        query = """
        MERGE (u:User {id: $user_id})
        ON CREATE SET u.label = 'User', u.created_at = timestamp()
        RETURN u
        """
        self._execute_write(query, {"user_id": user_id})

    def extract_graph_from_text(self, text: str, source_id: str, source_title: str, user_id: str) -> None:
        """Uses LLM to extract entities/relationships and injects them into Neo4j."""
        prompt = PromptTemplate.from_template(
            "Extract key entities and relationships from the following text.\n"
            "Return the result as JSON with 'nodes' (id, label, type) and 'edges' (source, target, relationship).\n"
            "Nodes must have a clear type (e.g., Concept, Person, Technology).\n"
            "Text: {text}\n"
        )
        
        chain = prompt | self.llm.with_structured_output(GraphExtractionResult)
        
        try:
            # We process a chunk for MVP
            result = chain.invoke({"text": text[:2500]}) 
            
            # 1. Ensure User node
            self.ensure_user_node(user_id)
            
            # 2. Add Document Node connected to User
            doc_query = """
            MATCH (u:User {id: $user_id})
            MERGE (d:Document {id: $source_id})
            ON CREATE SET d.title = $source_title, d.type = 'source'
            MERGE (u)-[:INGESTED]->(d)
            """
            self._execute_write(doc_query, {"user_id": user_id, "source_id": source_id, "source_title": source_title})
            
            # 3. Add Extracted Nodes and link to Document
            for node in result.nodes:
                # Sanitize type for Cypher Label
                node_type = node.type.capitalize().replace(" ", "")
                node_query = f"""
                MATCH (d:Document {{id: $source_id}})
                MERGE (n:{node_type} {{id: $node_id}})
                ON CREATE SET n.label = $node_label, n.type = $node_type
                MERGE (d)-[:MENTIONS]->(n)
                """
                self._execute_write(node_query, {
                    "source_id": source_id, 
                    "node_id": node.id, 
                    "node_label": node.label,
                    "node_type": node.type
                })
                
            # 4. Add Relationships between extracted nodes
            for edge in result.edges:
                rel_type = edge.relationship.upper().replace(" ", "_")
                edge_query = f"""
                MATCH (a {{id: $source}})
                MATCH (b {{id: $target}})
                MERGE (a)-[:{rel_type}]->(b)
                """
                self._execute_write(edge_query, {"source": edge.source, "target": edge.target})
                
        except Exception as e:
            print(f"Graph extraction failed: {e}")

    def get_related_entities(self, query: str, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Find nodes connected to the user's graph that might be relevant."""
        # MVP: Return the most connected concepts in the user's universal graph
        q = """
        MATCH (u:User {id: $user_id})-[:INGESTED]->(d:Document)-[:MENTIONS]->(n)
        WHERE NOT n:User AND NOT n:Document
        WITH n, count(d) as degree
        ORDER BY degree DESC
        LIMIT $limit
        RETURN n.id AS id, n.label AS label, labels(n)[0] AS type, degree
        """
        results = self._execute_read(q, {"user_id": user_id, "limit": limit})
        return results

graph_engine = Neo4jGraphEngine()
