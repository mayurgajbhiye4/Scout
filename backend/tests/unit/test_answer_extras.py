"""
Answer extras shown around a research chat answer, all built without another model call:
- graph relations numbered R1.. from the evidence query, and the model may only pick those ids
- typed research threads (GAP / TENSION / DEEPER) parsed after the follow-ups marker
- evidence quotes: each citation of a sentence or bullet gets the passage of its source that overlaps it most,
  and each cited source one quote to fall back on
- the saved extras keep only what the (possibly trimmed) answer still cites
"""
from langchain_core.messages import HumanMessage

from app.agent import nodes
from app.agent.evidence import claim_key, select_evidence, split_claims
from app.core.rate_limit import limiter_backend
from app.retrieval.graph_facts import format_graph_facts, relations_from_entities
from app.services.chat_service import build_answer_extras
from app.services.suggestion_service import build_threads

ENTITIES = [
    {
        "label": "Depth", "type": "Concept", "documents": [],
        "neighbors": [
            {"label": "Caller leverage", "type": "Concept", "relationship": "MEASURED_BY", "outgoing": True, "description": "depth is judged by leverage"},
            {"label": "Line ratio", "type": "Metric", "relationship": "CONTRASTS_WITH", "outgoing": False},
            {"label": "Caller leverage", "type": "Concept", "relationship": "MEASURED_BY", "outgoing": True},
            {"label": "Plain neighbour", "type": "Concept"},
        ],
    }
]
RELATIONS = relations_from_entities(ENTITIES, definitions={"MEASURED_BY": "assessed with a metric"})


def test_relations_are_directed_numbered_and_deduplicated():
    assert [(r["id"], r["source"], r["relationship"], r["target"]) for r in RELATIONS] == [
        ("R1", "Depth", "MEASURED_BY", "Caller leverage"),
        ("R2", "Line ratio", "CONTRASTS_WITH", "Depth"),
    ]
    assert RELATIONS[0]["definition"] == "assessed with a metric"
    facts = format_graph_facts({"entities": ENTITIES, "relations": RELATIONS})
    assert "Relations:\nR1: Depth (Concept) —MEASURED_BY→ Caller leverage (Concept) — depth is judged by leverage" in facts


def test_split_answer_extras_keeps_known_relations_and_typed_threads():
    text = (
        f"Answer [1].\n{nodes.FOLLOW_UPS_MARKER}\n"
        "REL | R1 | depth only means something relative to callers\n"
        "REL | R9 | invented link\n"
        "REL | r1 | duplicate\n"
        "GAP | No source measures seam placement | How is seam placement measured?\n"
        "TENSION | The paper and the video weigh depth differently | Which depth metric holds up?\n"
        "DEEPER | Locality | How does locality limit change impact?\n"
        "NOTE | stray line\n"
        "GAP | missing question\n"
    )
    answer, relations, threads = nodes.split_answer_extras(text, RELATIONS)
    assert answer == "Answer [1]."
    assert [r["id"] for r in relations] == ["R1"]
    assert relations[0]["note"] == "depth only means something relative to callers"
    assert [(t["kind"], t["question"]) for t in threads] == [
        ("gap", "How is seam placement measured?"),
        ("tension", "Which depth metric holds up?"),
        ("deeper", "How does locality limit change impact?"),
    ]
    assert threads[2]["concept"] == "Locality"
    assert "concept" not in threads[0]


def test_bare_question_lines_still_become_threads():
    _, relations, threads = nodes.split_answer_extras(f"A.{nodes.FOLLOW_UPS_MARKER}\n- “Why?”\n", [])
    assert relations == []
    assert threads == [{"kind": "deeper", "text": "", "question": "Why?"}]


def test_claim_key_and_split_claims():
    assert claim_key("Depth is **leverage** [1][2].") == "depth is leverage"
    claims = split_claims(
        "Depth is leverage [1]. Locality matters. Seams sit between modules [2][3].\n\n"
        "- Bullets count too [1].\n```\ncode [1].\n```"
    )
    assert claims == [
        {"key": "depth is leverage", "citations": [1]},
        {"key": "seams sit between modules", "citations": [2, 3]},
        {"key": "bullets count too", "citations": [1]},
    ]


def test_select_evidence_quotes_the_overlapping_passage_and_skips_graph():
    sources = [
        {"kind": "graph", "chunks": [{"content": "- Seams (Concept) related to: Modules", "chunk_index": 0}]},
        {"kind": "library", "chunks": [
            {"content": "Intro text about books. A seam is the boundary between two modules where behaviour can vary.", "chunk_index": 4},
            {"content": "Unrelated passage on testing.", "chunk_index": 5},
        ]},
    ]
    evidence = select_evidence("Seams mark the boundary between modules [1][2].", sources)
    quote = {"quote": "A seam is the boundary between two modules where behaviour can vary.", "chunk_index": 4}
    assert evidence["claims"] == [{"key": "seams mark the boundary between modules", "citation_index": 2, **quote}]
    # The graph source is cited too, but a list of graph facts is never quoted
    assert evidence["sources"] == {"2": quote}


def test_select_evidence_quotes_every_source_a_sentence_cites_and_bullets_too():
    sources = [
        {"kind": "library", "chunks": [{"content": "A seam is the boundary between two modules.", "chunk_index": 1}]},
        {"kind": "web", "chunks": [{"content": "Modules meet at a boundary called a seam. Tests swap behaviour at seams.", "chunk_index": 0}]},
    ]
    evidence = select_evidence(
        "A seam is the boundary between modules [1][2].\n\n- Tests swap behaviour at seams [2].\n- Nothing cited here.",
        sources,
    )
    assert [(c["key"], c["citation_index"], c["quote"]) for c in evidence["claims"]] == [
        ("a seam is the boundary between modules", 1, "A seam is the boundary between two modules."),
        ("a seam is the boundary between modules", 2, "Modules meet at a boundary called a seam."),
        ("tests swap behaviour at seams", 2, "Tests swap behaviour at seams."),
    ]
    assert set(evidence["sources"]) == {"1", "2"}


def test_select_evidence_skips_passages_that_share_one_word():
    sources = [{"kind": "library", "chunks": [{"content": "Modules are discussed in chapter nine.", "chunk_index": 0}]}]
    evidence = select_evidence("Seams mark the boundary between modules [1].", sources)
    assert evidence["claims"] == []
    # Still the closest thing the source says, offered as the source's quote rather than as this sentence's
    assert evidence["sources"] == {"1": {"quote": "Modules are discussed in chapter nine.", "chunk_index": 0}}
    assert "sources" not in select_evidence("Nothing is cited.", sources)


def test_build_answer_extras_drops_uncited_evidence_and_empty_results():
    evidence = {"claims": [{"key": "a", "citation_index": 1, "quote": "q", "chunk_index": 0},
                           {"key": "b", "citation_index": 2, "quote": "q", "chunk_index": 0}]}
    extras = build_answer_extras(evidence, [], [], [{"citation_index": 1}])
    assert extras["evidence"] == {"claims": [evidence["claims"][0]]}
    with_sources = {**evidence, "sources": {"1": {"quote": "s1"}, "2": {"quote": "s2"}}}
    assert build_answer_extras(with_sources, [], [], [{"citation_index": 2}])["evidence"] == {
        "claims": [evidence["claims"][1]], "sources": {"2": {"quote": "s2"}},
    }
    assert build_answer_extras({"claims": [], "sources": {"1": {"quote": "s1"}}}, [], [], [{"citation_index": 1}])["evidence"] == {
        "claims": [], "sources": {"1": {"quote": "s1"}},
    }
    assert build_answer_extras(evidence, [], [], [{"citation_index": 3}]) is None
    assert build_answer_extras({}, [], [], []) is None


def test_fallback_threads_are_plain_questions_that_claim_nothing():
    threads = build_threads(
        "What is depth?",
        {"entities": ENTITIES},
        [{"source_title": "Paper"}, {"source_title": "Video"}],
        [],
        count=3,
    )
    # Without a model reading the sources there is no real gap or conflict to state, so none is invented
    assert [t["kind"] for t in threads] == ["deeper", "deeper", "deeper"]
    assert all(t["text"] == "" for t in threads)
    assert threads[0]["concept"] == "Caller leverage"
    assert threads[1] == {"kind": "deeper", "text": "", "question": "Where do these sources disagree?"}


async def test_generate_returns_extras(monkeypatch):
    limiter_backend.reset()

    class FakeLLM:
        async def ainvoke(self, messages):
            from langchain_core.messages import AIMessage
            return AIMessage(content=(
                f"Retrieval runs before generation [1].\n{nodes.FOLLOW_UPS_MARKER}\n"
                "GAP | No source compares retrievers | Which retriever works best?\n"
            ))

    monkeypatch.setattr(nodes, "llm", FakeLLM())
    result = await nodes.generate_node({
        "user_id": "u",
        "messages": [HumanMessage(content="What is RAG?")],
        "retrieved_chunks": [{"id": "c1", "source_id": "s1", "source_title": "RAG paper", "chunk_index": 2,
                              "content": "In RAG, retrieval runs before generation so answers stay grounded."}],
    })
    assert result["threads"] == [{"kind": "gap", "text": "No source compares retrievers", "question": "Which retriever works best?"}]
    assert result["follow_ups"] == ["Which retriever works best?"]
    assert result["evidence"]["claims"][0]["chunk_index"] == 2
