import os
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from pydantic import BaseModel
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from app.core.config import settings

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

        self.llm = ChatGoogleGenerativeAI(
            model=settings.LLM_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0
        )

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
            ON CREATE SET d.title = $source_title, d.type = 'source', d.created_at = timestamp()
            ON MATCH SET d.title = $source_title, d.updated_at = timestamp(), d.created_at = coalesce(d.created_at, timestamp())
            MERGE (d)-[r:EXTRACTED_FROM]->(u)
            SET r.timestamp = timestamp()
            """
            self._execute_write(doc_query, {"user_id": user_id, "source_id": source_id, "source_title": source_title})
            
            # 3. Add Extracted Nodes and link to Document
            for node in result.nodes:
                # Sanitize type for Cypher Label
                node_type = node.type.capitalize().replace(" ", "")
                node_query = f"""
                MATCH (d:Document {{id: $source_id}})
                MERGE (n:{node_type} {{id: $node_id}})
                ON CREATE SET n.label = $node_label, n.type = $node_type, n.created_at = timestamp()
                MERGE (d)-[m:MENTIONS]->(n)
                SET m.timestamp = timestamp()
                """
                self._execute_write(node_query, {
                    "source_id": source_id, 
                    "node_id": node.id, 
                    "node_label": node.label,
                    "node_type": node.type
                })
                
            # 4. Add Relationships between extracted nodes
            for edge in result.edges:
                rel_type = "RELATES_TO"
                edge_query = f"""
                MATCH (a {{id: $source}})
                MATCH (b {{id: $target}})
                MERGE (a)-[r:{rel_type}]->(b)
                SET r.timestamp = timestamp()
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

    def get_query_context(self, query: str, user_id: str) -> str:
        """
        Extracts relevant knowledge graph facts, entities, and user memory context
        to ground LLM responses for the given query.
        """
        if not self.driver:
            return ""

        context_sections = []
        try:
            # 1. Fetch user's recent memory / curiosity / explored concepts
            mem_query = """
            MATCH (u:User {id: $user_id})-[r]->(t)
            WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
            RETURN type(r) AS rel, t.label AS label, labels(t)[0] AS type
            ORDER BY r.timestamp DESC
            LIMIT 8
            """
            memories = self._execute_read(mem_query, {"user_id": user_id})
            if memories:
                mem_lines = []
                for m in memories:
                    label = m.get("label") or "Unknown"
                    rel = m.get("rel", "EXPLORED").replace("_", " ").lower()
                    m_type = m.get("type", "Concept")
                    mem_lines.append(f"- User {rel}: '{label}' ({m_type})")
                context_sections.append("User Mindmap & Past Explorations:\n" + "\n".join(mem_lines))

            # 2. Extract keywords from query
            import re
            keywords = [w.lower() for w in re.findall(r'\b\w+\b', query) if len(w) > 2]

            # 3. Fetch knowledge graph entities and facts
            entity_query = """
            MATCH (a)-[r:RELATES_TO]->(b)
            RETURN a.label AS source, labels(a)[0] AS source_type,
                   type(r) AS rel,
                   b.label AS target, labels(b)[0] AS target_type
            LIMIT 25
            """
            facts = self._execute_read(entity_query, {})
            
            # Also fetch entities mentioned in user's documents if available
            doc_entities_query = """
            MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
            RETURN d.title AS doc_title, n.label AS entity_label, labels(n)[0] AS entity_type
            LIMIT 15
            """
            doc_entities = self._execute_read(doc_entities_query, {"user_id": user_id})

            fact_lines = []
            if facts:
                def matches(f):
                    s = (f.get("source") or "").lower()
                    t = (f.get("target") or "").lower()
                    return any(k in s or k in t for k in keywords)

                sorted_facts = sorted(facts, key=lambda f: 0 if matches(f) else 1)
                for f in sorted_facts[:10]:
                    src = f.get("source")
                    tgt = f.get("target")
                    if src and tgt:
                        rel = f.get("rel", "RELATES_TO")
                        st = f.get("source_type") or "Concept"
                        tt = f.get("target_type") or "Concept"
                        fact_lines.append(f"- {src} ({st}) -[{rel}]-> {tgt} ({tt})")

            if doc_entities:
                for de in doc_entities[:8]:
                    doc_t = de.get("doc_title") or "Source"
                    ent_lbl = de.get("entity_label")
                    ent_type = de.get("entity_type") or "Concept"
                    if ent_lbl:
                        fact_lines.append(f"- Document '{doc_t}' mentions: {ent_lbl} ({ent_type})")

            if fact_lines:
                context_sections.append("Knowledge Graph Entities & Semantic Relationships:\n" + "\n".join(fact_lines))

        except Exception as e:
            print(f"Error extracting graph context: {e}")

        return "\n\n".join(context_sections)

    def get_full_user_graph(self, user_id: str, limit: int = 100) -> Dict[str, Any]:
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

    def list_user_graphs(self, user_id: str) -> List[Dict[str, Any]]:
        """Lists all individual graphs available to the user for graph browsing."""
        graphs = []

        # 1. Universal Knowledge Graph
        univ_q = """
        MATCH (n)
        WHERE NOT n:User AND (n:Document OR EXISTS((:Document)-[:MENTIONS]->(n)))
        OPTIONAL MATCH (a)-[r:RELATES_TO]->(b)
        RETURN count(DISTINCT n) AS node_count,
               count(DISTINCT r) AS rel_count,
               collect(DISTINCT n.label)[0..5] AS top_entities
        """
        univ_res = self._execute_read(univ_q)
        univ_node_count = univ_res[0]["node_count"] + 1 if univ_res and univ_res[0].get("node_count") else 0
        univ_edge_count = univ_res[0]["rel_count"] if univ_res and univ_res[0].get("rel_count") else 0
        univ_entities = [e for e in (univ_res[0].get("top_entities") or []) if e] if univ_res else []

        graphs.append({
            "id": "universal",
            "title": "Universal Knowledge Graph",
            "description": "Complete interconnected neural map across all research sources, entities, and concepts",
            "type": "universal",
            "node_count": univ_node_count,
            "edge_count": univ_edge_count,
            "top_entities": univ_entities,
        })

        # 2. Personal Research Mindmap
        mem_q = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
        RETURN count(DISTINCT t) AS node_count,
               count(r) AS edge_count,
               collect(DISTINCT t.label)[0..5] AS top_entities
        """
        mem_res = self._execute_read(mem_q, {"user_id": user_id})
        mem_node_count = (mem_res[0]["node_count"] + 1) if mem_res and mem_res[0].get("node_count") else 1
        mem_edge_count = mem_res[0]["edge_count"] if mem_res and mem_res[0].get("edge_count") else 0
        mem_entities = [e for e in (mem_res[0].get("top_entities") or []) if e] if mem_res else []

        graphs.append({
            "id": "memory",
            "title": "Personal Research Mindmap",
            "description": "Active interests, curiosity graph, and concepts you have explored",
            "type": "memory",
            "node_count": mem_node_count,
            "edge_count": mem_edge_count,
            "top_entities": mem_entities,
        })

        # 3. Individual Document Subgraphs
        doc_q = """
        MATCH (d:Document)
        OPTIONAL MATCH (d)-[:MENTIONS]->(n)
        WITH d, collect(DISTINCT n) AS mentions
        UNWIND (CASE WHEN mentions = [] THEN [null] ELSE mentions END) AS a
        OPTIONAL MATCH (a)-[r:RELATES_TO]->(b)
        WHERE b IN mentions
        WITH d, mentions, count(DISTINCT r) AS rel_count
        RETURN d.id AS id,
               d.title AS title,
               d.type AS doc_type,
               CASE WHEN mentions = [] THEN 1 ELSE size(mentions) + 1 END AS node_count,
               CASE WHEN mentions = [] THEN 0 ELSE size(mentions) + rel_count END AS edge_count,
               [x IN mentions WHERE x.label IS NOT NULL | x.label][0..5] AS top_entities
        ORDER BY d.title ASC
        """
        doc_res = self._execute_read(doc_q)
        for r in (doc_res or []):
            if r.get("id"):
                graphs.append({
                    "id": r["id"],
                    "source_id": r["id"],
                    "title": r.get("title") or "Document Knowledge Graph",
                    "description": f"Entities and relationships extracted from '{r.get('title') or 'source'}'",
                    "type": "document",
                    "node_count": r.get("node_count", 0),
                    "edge_count": r.get("edge_count", 0),
                    "top_entities": r.get("top_entities") or [],
                })

        return graphs

    def get_document_graph(self, document_id: str) -> Dict[str, Any]:
        """Returns the specific knowledge subgraph for a single document."""
        query = """
        MATCH (d:Document {id: $doc_id})
        OPTIONAL MATCH (d)-[:MENTIONS]->(n)
        WITH d, collect(DISTINCT n) AS mentions
        UNWIND (CASE WHEN mentions = [] THEN [null] ELSE mentions END) AS a
        OPTIONAL MATCH (a)-[r:RELATES_TO]->(b)
        WHERE b IN mentions
        RETURN d.id AS doc_id, d.title AS doc_title,
               [node IN mentions WHERE node.id IS NOT NULL | {id: node.id, label: node.label, type: labels(node)[0]}] AS entity_nodes,
               [node IN mentions WHERE node.id IS NOT NULL | {source: d.id, target: node.id, relationship: 'MENTIONS'}] AS mention_edges,
               collect(DISTINCT {source: a.id, target: b.id, relationship: type(r)}) AS rel_edges
        """
        results = self._execute_read(query, {"doc_id": document_id})
        if not results:
            return {"nodes": [], "edges": []}

        row = results[0]
        nodes = []
        edges = []

        doc_id = row.get("doc_id") or document_id
        doc_title = row.get("doc_title") or "Document"
        nodes.append({"id": doc_id, "label": doc_title, "type": "Document"})

        seen_nodes = {doc_id}
        for en in (row.get("entity_nodes") or []):
            if en and en.get("id") and en["id"] not in seen_nodes:
                seen_nodes.add(en["id"])
                nodes.append(en)

        for me in (row.get("mention_edges") or []):
            if me and me.get("source") and me.get("target"):
                edges.append(me)

        for re in (row.get("rel_edges") or []):
            if re and re.get("source") and re.get("target"):
                edges.append(re)

        return {"nodes": nodes, "edges": edges}

    def get_memory_graph(self, user_id: str) -> Dict[str, Any]:
        """Returns the user's personal curiosity and memory subgraph."""
        query = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
        RETURN collect(DISTINCT {id: t.id, label: t.label, type: labels(t)[0]}) AS nodes,
               collect(DISTINCT {source: u.id, target: t.id, relationship: type(r)}) AS edges
        """
        results = self._execute_read(query, {"user_id": user_id})
        nodes = [{"id": user_id, "label": "You", "type": "User"}]
        edges = []

        if results:
            row = results[0]
            seen = {user_id}
            for n in (row.get("nodes") or []):
                if n and n.get("id") and n["id"] not in seen:
                    seen.add(n["id"])
                    nodes.append(n)
            for e in (row.get("edges") or []):
                if e and e.get("source") and e.get("target"):
                    edges.append(e)

        return {"nodes": nodes, "edges": edges}

    def get_graph_by_id(self, user_id: str, graph_id: str = "universal") -> Dict[str, Any]:
        """Dispatches to the appropriate graph resolver based on graph_id."""
        if not graph_id or graph_id == "universal":
            return self.get_full_user_graph(user_id)
        elif graph_id == "memory":
            return self.get_memory_graph(user_id)
        else:
            return self.get_document_graph(graph_id)

graph_engine = Neo4jGraphEngine()
