import os
import re
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from pydantic import BaseModel
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from app.core.config import settings
from app.core.rate_limit import enforce_pipeline_rate_limit
from app.retrieval.graph_facts import format_graph_facts
from app.retrieval.keywords import extract_query_keywords

load_dotenv()

class Node(BaseModel):
    id: str
    label: str
    type: str
    description: str = ""

class Edge(BaseModel):
    source: str
    target: str
    relationship: str
    description: str = ""

class GraphExtractionResult(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


# Relationships the app itself writes (source → entity, source → user, user memory). Extracted
# entity-to-entity relations may not use these names, and "semantic" queries exclude them.
MEMORY_RELATIONSHIPS = ["LIKES", "DISLIKES", "EXPLORED", "CURIOUS_ABOUT"]
STRUCTURAL_RELATIONSHIPS = ["MENTIONS", "EXTRACTED_FROM", *MEMORY_RELATIONSHIPS]

# The only entity-to-entity relations stored and shown, each read as "source RELATIONSHIP target".
RESEARCH_RELATIONSHIPS: Dict[str, str] = {
    # Evidence & argument
    "SUPPORTS": "source evidence or finding backs the target claim or hypothesis",
    "CONTRADICTS": "source conflicts with or refutes the target claim or finding",
    "EXTENDS": "source builds on the target prior work, idea or method",
    # Causal & dependency
    "CAUSES": "source brings about or leads to the target effect",
    "CORRELATES_WITH": "source is associated with the target, causation not shown",
    "ENABLES": "source makes the target possible",
    "DEPENDS_ON": "source requires the target in order to work",
    # Methods & evaluation
    "USES": "source method or system employs the target technique, tool or dataset",
    "EVALUATED_ON": "source is tested on the target dataset or benchmark",
    "MEASURED_BY": "source quantity or outcome is assessed with the target metric",
    "OUTPERFORMS": "source does better than the target baseline or alternative",
    "CONTRASTS_WITH": "source is a competing or opposing approach to the target, no winner stated",
    "APPLIED_TO": "source is used for the target problem, task or domain",
    "LIMITED_BY": "source has the target weakness, constraint or open problem",
    # Taxonomy
    "IS_A": "source is a type or instance of the target",
    "PART_OF": "source is a component of the target",
    # Provenance
    "PROPOSED_BY": "source idea or method was introduced by the target person or organization",
}
RESEARCH_TYPES = list(RESEARCH_RELATIONSHIPS)

# Close synonyms the model may still produce, folded into the research set
RELATION_ALIASES = {
    "IMPROVES": "OUTPERFORMS",
    "IMPROVES_ON": "OUTPERFORMS",
    "BUILDS_ON": "EXTENDS",
    "CREATED_BY": "PROPOSED_BY",
    "INTRODUCED_BY": "PROPOSED_BY",
    "DEVELOPED_BY": "PROPOSED_BY",
    "EXAMPLE_OF": "IS_A",
    "TYPE_OF": "IS_A",
    "INSTANCE_OF": "IS_A",
    "REQUIRES": "DEPENDS_ON",
    "REFUTES": "CONTRADICTS",
    "TESTED_ON": "EVALUATED_ON",
    "LEADS_TO": "CAUSES",
}


def _research_rel_type(value: str) -> Optional[str]:
    """The research relationship a model-given name stands for, or None if it is none of them. Only names from
    RESEARCH_RELATIONSHIPS come back, so the result is safe to interpolate into Cypher."""
    rel = re.sub(r"[^A-Z0-9]+", "_", (value or "").upper()).strip("_")
    rel = RELATION_ALIASES.get(rel, rel)
    return rel if rel in RESEARCH_RELATIONSHIPS else None


def _sanitize_label(value: str) -> str:
    """A node label that is safe to interpolate into Cypher. Keeps the original `capitalize()` casing
    so entities extracted before this existed still MERGE onto the same label."""
    label = re.sub(r"[^A-Za-z0-9]", "", (value or "").capitalize())[:40]
    if not label or not label[0].isalpha() or label in ("User", "Document"):
        return "Concept"
    return label


def _short(text: str, limit: int = 240) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"

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
        enforce_pipeline_rate_limit(
            scope="pipeline:llm",
            limit=settings.PIPELINE_LLM_RPM,
            window=60,
            identifier=user_id,
            description="Knowledge graph entity extraction LLM chain",
        )
        enforce_pipeline_rate_limit(
            scope="pipeline:graph_db",
            limit=settings.PIPELINE_GRAPH_RPM,
            window=60,
            identifier=user_id,
            description="Neo4j graph entity and relationship write",
        )

        prompt = PromptTemplate.from_template(
            "Extract the key entities and the relationships between them from the following text.\n"
            "Return JSON with 'nodes' (id, label, type, description) and 'edges' (source, target, relationship, description).\n"
            "Nodes: give each a clear type (e.g., Concept, Person, Technology, Organization) and a description: "
            "one plain sentence (max 20 words) saying what it is, as the text presents it.\n"
            "Edges: 'source' and 'target' are node ids. 'relationship' is read as 'source RELATIONSHIP target' and "
            "MUST be exactly one of these:\n{vocabulary}\n"
            "If none of them fits, leave the edge out. 'description' says in max 15 words how they are related in the text.\n"
            "Text: {text}\n"
        )

        chain = prompt | self.llm.with_structured_output(GraphExtractionResult)
        vocabulary = "\n".join(f"- {name}: {meaning}" for name, meaning in RESEARCH_RELATIONSHIPS.items())

        try:
            # We process a chunk for MVP
            result = chain.invoke({"text": text[:2500], "vocabulary": vocabulary})
            self._write_extraction(result, source_id, source_title, user_id)
        except Exception as e:
            print(f"Graph extraction failed: {e}")

    def _write_extraction(self, result: GraphExtractionResult, source_id: str, source_title: str, user_id: str) -> None:
        """Writes an extraction result: the Document node, its MENTIONS edges and the typed relations."""
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

        # 3. Add Extracted Nodes and link to Document. The first non-empty description is kept.
        for node in result.nodes:
            node_type = _sanitize_label(node.type)
            node_query = f"""
            MATCH (d:Document {{id: $source_id}})
            MERGE (n:{node_type} {{id: $node_id}})
            ON CREATE SET n.label = $node_label, n.type = $node_type, n.created_at = timestamp()
            SET n.description = CASE WHEN coalesce(n.description, '') = '' THEN $description ELSE n.description END
            MERGE (d)-[m:MENTIONS]->(n)
            SET m.timestamp = timestamp()
            """
            self._execute_write(node_query, {
                "source_id": source_id,
                "node_id": node.id,
                "node_label": node.label,
                "node_type": node.type,
                "description": _short(node.description),
            })

        # 4. Add research relationships between extracted nodes; anything outside the set is dropped
        for edge in result.edges:
            rel_type = _research_rel_type(edge.relationship)
            if edge.source == edge.target or not rel_type:
                continue
            edge_query = f"""
            MATCH (a {{id: $source}})
            MATCH (b {{id: $target}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET r.timestamp = timestamp(), r.description = $description, r.source_id = $source_id
            """
            self._execute_write(edge_query, {
                "source": edge.source,
                "target": edge.target,
                "description": _short(edge.description, 160),
                "source_id": source_id,
            })

    def reextract_source(self, text: str, source_id: str, source_title: str, user_id: str) -> None:
        """Rebuilds a source's relations from the research set. Among the entities this document mentions it first
        drops every relation outside that set (legacy free-form types) and the research relations it wrote itself."""
        cleanup_query = """
        MATCH (d:Document {id: $source_id})-[:MENTIONS]->(a)-[r]->(b)<-[:MENTIONS]-(d)
        WHERE NOT type(r) IN $structural
          AND (NOT type(r) IN $research OR r.source_id = $source_id)
        DELETE r
        """
        self._execute_write(cleanup_query, {
            "source_id": source_id, "structural": STRUCTURAL_RELATIONSHIPS, "research": RESEARCH_TYPES,
        })
        self.extract_graph_from_text(text, source_id, source_title, user_id)

    def get_related_entities(self, query: str, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Find nodes connected to the user's graph that might be relevant."""
        enforce_pipeline_rate_limit(
            scope="pipeline:graph_db",
            limit=settings.PIPELINE_GRAPH_RPM,
            window=60,
            identifier=user_id,
            description="Neo4j related entities retrieval",
        )
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

    def get_graph_evidence(self, query: str, user_id: str, limit: int = 8) -> Dict[str, Any]:
        """
        Question-targeted knowledge graph evidence, scoped to the user's own documents.

        Returns:
            entities: matched entities with the documents that mention them and their
                related neighbours (each also from the user's graph).
            memories: the user's recent explorations / interests (personalisation, not evidence).
        """
        evidence: Dict[str, Any] = {"entities": [], "memories": []}
        if not self.driver or not user_id:
            return evidence

        enforce_pipeline_rate_limit(
            scope="pipeline:graph_db",
            limit=settings.PIPELINE_GRAPH_RPM,
            window=60,
            identifier=user_id,
            description="Neo4j query context graph retrieval",
        )

        try:
            mem_query = """
            MATCH (u:User {id: $user_id})-[r]->(t)
            WHERE type(r) IN ['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']
            RETURN type(r) AS rel, t.label AS label, labels(t)[0] AS type
            ORDER BY r.timestamp DESC
            LIMIT 8
            """
            for m in self._execute_read(mem_query, {"user_id": user_id}) or []:
                label = m.get("label")
                if label:
                    rel = (m.get("rel") or "EXPLORED").replace("_", " ").lower()
                    evidence["memories"].append(f"User {rel}: '{label}' ({m.get('type') or 'Concept'})")

            keywords = extract_query_keywords(query)
            if not keywords:
                return evidence

            entity_query = """
            MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
            WHERE NOT n:User AND NOT n:Document AND n.label IS NOT NULL
              AND any(kw IN $keywords WHERE toLower(n.label) CONTAINS kw)
            WITH n, collect(DISTINCT {id: d.id, title: d.title})[..4] AS documents, count(DISTINCT d) AS doc_count
            ORDER BY doc_count DESC
            LIMIT $limit
            OPTIONAL MATCH (n)-[sr]-(m)
            WHERE type(sr) IN $research AND m.label IS NOT NULL
              AND (m)<-[:MENTIONS]-(:Document)-[:EXTRACTED_FROM]->(:User {id: $user_id})
            WITH n, documents, doc_count, collect(DISTINCT {label: m.label, type: labels(m)[0]})[..6] AS neighbors
            RETURN n.label AS label, labels(n)[0] AS type, documents, doc_count, neighbors
            ORDER BY doc_count DESC
            """
            rows = self._execute_read(entity_query, {
                "user_id": user_id, "keywords": keywords, "limit": limit, "research": RESEARCH_TYPES,
            }) or []
            for row in rows:
                evidence["entities"].append({
                    "label": row.get("label"),
                    "type": row.get("type") or "Concept",
                    "documents": [d for d in (row.get("documents") or []) if d and d.get("id")],
                    "neighbors": [nb for nb in (row.get("neighbors") or []) if nb and nb.get("label")],
                })
        except Exception as e:
            print(f"Error extracting graph evidence: {e}")

        return evidence

    def get_query_context(self, query: str, user_id: str) -> str:
        """Graph facts and user memory for a query as prompt-ready text."""
        evidence = self.get_graph_evidence(query, user_id)
        sections = []
        if evidence["memories"]:
            sections.append("User Mindmap & Past Explorations:\n" + "\n".join(f"- {m}" for m in evidence["memories"]))
        facts = format_graph_facts(evidence)
        if facts:
            sections.append("Knowledge Graph Entities & Semantic Relationships:\n" + facts)
        return "\n\n".join(sections)

    def get_related_sources_from_graph(self, query: str, user_id: str, limit: int = 4) -> List[Dict[str, Any]]:
        """User documents linked to the query through the graph: they mention a matching entity,
        an entity one relation hop away from one, or have a matching title."""
        if not self.driver or not user_id:
            return []
        keywords = extract_query_keywords(query)
        if not keywords:
            return []
        try:
            q = """
            MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
            WHERE n.label IS NOT NULL
            OPTIONAL MATCH (n)-[sr]-(nb) WHERE type(sr) IN $research
            WITH d, n, collect(DISTINCT toLower(coalesce(nb.label, ''))) AS nb_labels
            WITH d, n,
                 any(kw IN $keywords WHERE toLower(n.label) CONTAINS kw) AS direct,
                 any(kw IN $keywords WHERE any(l IN nb_labels WHERE l CONTAINS kw)) AS via_neighbor,
                 any(kw IN $keywords WHERE toLower(coalesce(d.title, '')) CONTAINS kw) AS by_title
            WHERE direct OR via_neighbor OR by_title
            WITH d, collect(DISTINCT CASE WHEN direct OR via_neighbor THEN n.label END) AS matched,
                 sum(CASE WHEN direct THEN 2 WHEN via_neighbor THEN 1 ELSE 0 END) + max(CASE WHEN by_title THEN 2 ELSE 0 END) AS score
            RETURN d.id AS source_id, d.title AS source_title, matched[..5] AS matched_entities, score
            ORDER BY score DESC
            LIMIT $limit
            """
            results = self._execute_read(q, {
                "user_id": str(user_id), "keywords": keywords, "limit": limit, "research": RESEARCH_TYPES,
            }) or []
            return [r for r in results if r.get("source_id")]
        except Exception as e:
            print(f"Error querying related sources from graph: {e}")
            return []

    def get_document_entities(self, source_ids: List[str], user_id: str, limit: int = 12) -> List[Dict[str, Any]]:
        """Entities mentioned in the given user documents, most central first (mentioned by the most
        of the user's documents). Used to suggest follow-up questions without an LLM call."""
        if not self.driver or not user_id or not source_ids:
            return []
        try:
            q = """
            MATCH (u:User {id: $user_id})<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
            WHERE d.id IN $source_ids AND n.label IS NOT NULL AND NOT n:User AND NOT n:Document
            OPTIONAL MATCH (n)<-[:MENTIONS]-(other:Document)-[:EXTRACTED_FROM]->(u)
            WITH d, n, count(DISTINCT other) AS reach
            RETURN d.id AS source_id, d.title AS source_title, n.label AS label, labels(n)[0] AS type, reach
            ORDER BY reach DESC
            LIMIT $limit
            """
            return self._execute_read(q, {"user_id": str(user_id), "source_ids": [str(s) for s in source_ids], "limit": limit}) or []
        except Exception as e:
            print(f"Error querying document entities: {e}")
            return []

    def get_full_user_graph(self, user_id: str, limit: int = 300) -> Dict[str, Any]:
        """Return the full knowledge graph for a user: all nodes and edges for UI visualization."""
        # Get all nodes connected to the user
        nodes_query = """
        MATCH (u:User {id: $user_id})
        OPTIONAL MATCH (u)<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
        WITH collect(DISTINCT {id: d.id, label: d.title, type: 'Document'}) +
             collect(DISTINCT {id: n.id, label: n.label, type: labels(n)[0], description: n.description}) AS all_nodes,
             u
        UNWIND all_nodes AS node
        WITH DISTINCT node, u
        WHERE node.id IS NOT NULL
        RETURN collect(node) AS nodes
        """

        # Source → entity, source → user, and typed relations between the user's own entities
        edges_query = """
        MATCH (u:User {id: $user_id})
        OPTIONAL MATCH (u)<-[:EXTRACTED_FROM]-(d:Document)-[:MENTIONS]->(n)
        WITH u, collect(DISTINCT {source: d.id, target: n.id, relationship: 'MENTIONS'}) AS mention_edges
        OPTIONAL MATCH (u)<-[:EXTRACTED_FROM]-(doc:Document)
        WITH u, mention_edges, collect(DISTINCT {source: doc.id, target: u.id, relationship: 'EXTRACTED_FROM'}) AS extracted_edges
        OPTIONAL MATCH (u)<-[:EXTRACTED_FROM]-(:Document)-[:MENTIONS]->(a)-[r]->(b)
        WHERE type(r) IN $research
          AND (b)<-[:MENTIONS]-(:Document)-[:EXTRACTED_FROM]->(u)
        WITH mention_edges, extracted_edges,
             collect(DISTINCT {source: a.id, target: b.id, relationship: type(r), description: r.description}) AS relation_edges
        WITH mention_edges + extracted_edges + relation_edges AS all_edges
        UNWIND all_edges AS edge
        WITH DISTINCT edge
        WHERE edge.source IS NOT NULL AND edge.target IS NOT NULL
        RETURN collect(edge) AS edges
        """

        # Also get user memory edges (LIKES, EXPLORED, etc.)
        memory_query = """
        MATCH (u:User {id: $user_id})-[r]->(t)
        WHERE type(r) IN $memory
        RETURN collect(DISTINCT {source: u.id, target: t.id, relationship: type(r)}) AS memory_edges,
               collect(DISTINCT {id: t.id, label: t.label, type: labels(t)[0], description: t.description}) AS memory_nodes
        """

        nodes_result = self._execute_read(nodes_query, {"user_id": user_id})
        edges_result = self._execute_read(edges_query, {"user_id": user_id, "research": RESEARCH_TYPES})
        memory_result = self._execute_read(memory_query, {"user_id": user_id, "memory": MEMORY_RELATIONSHIPS})

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

    def list_user_graphs(self, user_id: str, skip: int = 0, limit: int = 20) -> List[Dict[str, Any]]:
        """Lists all individual graphs available to the user for graph browsing."""
        graphs = []

        # 1. Universal Knowledge Graph
        univ_q = """
        MATCH (n)
        WHERE NOT n:User AND (n:Document OR EXISTS((:Document)-[:MENTIONS]->(n)))
        OPTIONAL MATCH (a)-[r]->(b) WHERE type(r) IN $research
        RETURN count(DISTINCT n) AS node_count,
               count(DISTINCT r) AS rel_count,
               collect(DISTINCT n.label)[0..5] AS top_entities
        """
        univ_res = self._execute_read(univ_q, {"research": RESEARCH_TYPES})
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
        OPTIONAL MATCH (a)-[r]->(b)
        WHERE b IN mentions AND type(r) IN $research
        WITH d, mentions, count(DISTINCT r) AS rel_count
        RETURN d.id AS id,
               d.title AS title,
               d.type AS doc_type,
               CASE WHEN mentions = [] THEN 1 ELSE size(mentions) + 1 END AS node_count,
               CASE WHEN mentions = [] THEN 0 ELSE size(mentions) + rel_count END AS edge_count,
               [x IN mentions WHERE x.label IS NOT NULL | x.label][0..5] AS top_entities
        ORDER BY d.title ASC
        """
        doc_res = self._execute_read(doc_q, {"research": RESEARCH_TYPES})
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

        if limit is None:
            return graphs[skip:]
        return graphs[skip : skip + limit]

    def get_document_graph(self, document_id: str) -> Dict[str, Any]:
        """Returns the specific knowledge subgraph for a single document."""
        query = """
        MATCH (d:Document {id: $doc_id})
        OPTIONAL MATCH (d)-[:MENTIONS]->(n)
        WITH d, collect(DISTINCT n) AS mentions
        UNWIND (CASE WHEN mentions = [] THEN [null] ELSE mentions END) AS a
        OPTIONAL MATCH (a)-[r]->(b)
        WHERE b IN mentions AND type(r) IN $research
        RETURN d.id AS doc_id, d.title AS doc_title,
               [node IN mentions WHERE node.id IS NOT NULL | {id: node.id, label: node.label, type: labels(node)[0], description: node.description}] AS entity_nodes,
               [node IN mentions WHERE node.id IS NOT NULL | {source: d.id, target: node.id, relationship: 'MENTIONS'}] AS mention_edges,
               collect(DISTINCT {source: a.id, target: b.id, relationship: type(r), description: r.description}) AS rel_edges
        """
        results = self._execute_read(query, {"doc_id": document_id, "research": RESEARCH_TYPES})
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
