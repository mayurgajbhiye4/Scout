"""
Unit tests for knowledge graph extraction writes.
Tests:
- Only research relationship types (or their aliases) are accepted; node labels are sanitized for Cypher
- Reserved (app-written) relationship names can't be produced by extraction
- _write_extraction stores descriptions and research relations, skipping self-loops and everything else
"""

from app.graph.engine import (
    Edge,
    GraphExtractionResult,
    Node,
    _research_rel_type,
    _sanitize_label,
    _short,
    graph_engine,
)


# ---------------------------------------------------------------------------
# Sanitizers
# ---------------------------------------------------------------------------
def test_rel_type_normalises_to_research_set():
    assert _research_rel_type("uses") == "USES"
    assert _research_rel_type("is a") == "IS_A"
    assert _research_rel_type("  part-of ") == "PART_OF"


def test_rel_type_folds_aliases():
    assert _research_rel_type("improves") == "OUTPERFORMS"
    assert _research_rel_type("created by") == "PROPOSED_BY"
    assert _research_rel_type("EXAMPLE_OF") == "IS_A"


def test_rel_type_rejects_anything_outside_the_set():
    for value in ("", "!!!", "INTEGRATES_WITH", "RELATES_TO", "USES]->(x) DETACH DELETE x //"):
        assert _research_rel_type(value) is None
    for reserved in ("MENTIONS", "extracted from", "LIKES", "curious_about"):
        assert _research_rel_type(reserved) is None


def test_label_keeps_capitalize_casing():
    # Must match the casing used before sanitizing existed, or MERGE would duplicate entities
    assert _sanitize_label("Person") == "Person"
    assert _sanitize_label("machine learning") == "Machinelearning"
    assert _sanitize_label("Technology`) DETACH DELETE n //") == "Technologydetachdeleten"


def test_label_falls_back_to_concept():
    assert _sanitize_label("") == "Concept"
    assert _sanitize_label("42") == "Concept"
    assert _sanitize_label("document") == "Concept"
    assert _sanitize_label("user") == "Concept"


def test_short_collapses_whitespace_and_truncates():
    assert _short("  a \n b  ") == "a b"
    out = _short("word " * 100, 20)
    assert len(out) <= 20 and out.endswith("…")


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------
def test_write_extraction_stores_descriptions_and_typed_relations(monkeypatch):
    calls = []
    monkeypatch.setattr(graph_engine, "_execute_write", lambda q, p=None: calls.append((q, p)))

    result = GraphExtractionResult(
        nodes=[
            Node(id="langchain", label="LangChain", type="Technology", description="A framework for LLM apps."),
            Node(id="gemini", label="Gemini", type="Technology", description="Google's LLM family."),
        ],
        edges=[
            Edge(source="langchain", target="gemini", relationship="uses", description="Ships a Gemini chat model."),
            Edge(source="langchain", target="gemini", relationship="integrates with", description="Not a research relation."),
            Edge(source="gemini", target="gemini", relationship="IS_A", description="loop"),
            Edge(source="gemini", target="langchain", relationship="MENTIONS"),
        ],
    )
    graph_engine._write_extraction(result, "src-1", "Doc", "user-1")

    node_writes = [(q, p) for q, p in calls if p and "node_id" in p]
    assert [p["description"] for _, p in node_writes] == ["A framework for LLM apps.", "Google's LLM family."]
    assert all("n.description = CASE" in q for q, _ in node_writes)

    # Unknown type, self-loop and the reserved name are all dropped
    edge_writes = [(q, p) for q, p in calls if p and "target" in p]
    assert len(edge_writes) == 1
    assert "[r:USES]" in edge_writes[0][0]
    assert edge_writes[0][1] == {
        "source": "langchain", "target": "gemini", "description": "Ships a Gemini chat model.", "source_id": "src-1",
    }
