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

        self.llm = ChatGoogleGenerativeAI(model="gemini-3.8-flash", temperature=0)

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
            "For edges between entities, use 'RELATES_TO' as the relationship.\n"
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
            MERGE (d)-[:EXTRACTED_FROM]->(u)
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
                # Force RELATES_TO if they didn't follow instructions perfectly
                rel_type = "RELATES_TO"
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
        MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
        WHERE NOT n:User AND NOT n:Document
        WITH n, count(d) as degree
        ORDER BY degree DESC
        LIMIT $limit
        RETURN n.id AS id, n.label AS label, labels(n)[0] AS type, degree
        """
        results = self._execute_read(q, {"user_id": user_id, "limit": limit})
        return results

    def get_full_user_graph(self, user_id: str, limit: int = 50) -> Dict[str, Any]:
        """Return the full knowledge graph for a user: all nodes and edges for UI visualization."""
        # Get all nodes connected to the user
        nodes_query = """
        MATCH (u:User {id: $user_id})
        OPTIONAL MATCH (u)<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
        WITH collect(DISTINCT {id: d.id, label: d.title, type: 'Document'}) + 
             collect(DISTINCT {id: n.id, label: n.label, type: labels(n)[0]}) AS all_nodes,
             u
        UNWIND all_nodes AS node
        WITH DISTINCT node, u
        WHERE node.id IS NOT NULL
        RETURN collect(node) AS nodes
        """
        
        edges_query = """
        MATCH (u:User {id: $user_id})
        OPTIONAL MATCH (u)<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
        WITH collect(DISTINCT {source: d.id, target: n.id, relationship: 'MENTIONS'}) AS mention_edges
        OPTIONAL MATCH (a)-[:RELATES_TO]->(b) WHERE a.id IS NOT NULL AND b.id IS NOT NULL
        WITH mention_edges, collect(DISTINCT {source: a.id, target: b.id, relationship: 'RELATES_TO'}) AS relates_edges
        WITH mention_edges + relates_edges AS all_edges
        UNWIND all_edges AS edge
        WITH DISTINCT edge
        WHERE edge.source IS NOT NULL AND edge.target IS NOT NULL
        RETURN collect(edge) AS edges
        """
        
        # Also get user memory edges (LIKES, EXPLORED, etc.)
        memory_query = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
        RETURN collect(DISTINCT {source: u.id, target: t.id, relationship: type(r)}) AS memory_edges,
               collect(DISTINCT {id: t.id, label: t.label, type: labels(t)[0]}) AS memory_nodes
        """
        
        nodes_result = self._execute_read(nodes_query, {"user_id": user_id})
        edges_result = self._execute_read(edges_query, {"user_id": user_id})
        memory_result = self._execute_read(memory_query, {"user_id": user_id})
        
        all_nodes = []
        all_edges = []
        
        # Add user root node
        all_nodes.append({"id": user_id, "label": "You", "type": "User"})
        
        if nodes_result and nodes_result[0].get("nodes"):
            all_nodes.extend(nodes_result[0]["nodes"])
        
        if edges_result and edges_result[0].get("edges"):
            all_edges.extend(edges_result[0]["edges"])
        
        if memory_result:
            mr = memory_result[0]
            if mr.get("memory_nodes"):
                all_nodes.extend(mr["memory_nodes"])
            if mr.get("memory_edges"):
                all_edges.extend(mr["memory_edges"])
        
        # Deduplicate nodes by id
        seen_ids = set()
        unique_nodes = []
        for node in all_nodes:
            nid = node.get("id")
            if nid and nid not in seen_ids:
                seen_ids.add(nid)
                unique_nodes.append(node)
        
        return {"nodes": unique_nodes[:limit], "edges": all_edges}

graph_engine = Neo4jGraphEngine()
