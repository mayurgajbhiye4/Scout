"""
Unit tests for the research chat pipeline.
Tests:
- Follow-up questions are retrieved together with the previous question
- Query keyword extraction and relevance filtering of library chunks (semantic, keyword, boosts, diversity)
- Knowledge graph retrieval wiring and evidence formatting
- Web search routing (forced, automatic fallback when the library has nothing relevant, disabled without a key)
- Web search never returns placeholder results to chat
- Evidence check: grading, query rewriting, source switching, retry limits, grader tokens never streamed
- generate_node: evidence ordering (library -> graph -> web), no source-coverage notes, strict citation
  detection, follow-up questions split off the answer
- Reference list built from citations, citation normalisation, history merging, mode-less sessions
"""

from types import SimpleNamespace

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent import nodes
from app.core.config import settings
from app.core.rate_limit import limiter_backend
from app.retrieval.graph_facts import format_graph_facts
from app.retrieval.keywords import extract_query_keywords, idf_weights, keyword_overlap
from app.schemas.sessions import SessionCreate
from app.services.chat_service import (
    REFERENCES_MARKER,
    build_references_markdown,
    format_citations,
    merge_consecutive_turns,
)
from app.tools.web_search import WebSearchTool


# ---------------------------------------------------------------------------
# Query understanding
# ---------------------------------------------------------------------------
def test_retrieval_query_combines_short_follow_up():
    messages = [
        HumanMessage(content="How does retrieval-augmented generation work?"),
        AIMessage(content="It retrieves documents and conditions generation on them."),
        HumanMessage(content="What are its limitations?"),
    ]
    assert nodes._retrieval_query(messages) == (
        "How does retrieval-augmented generation work?\nWhat are its limitations?"
    )


def test_retrieval_query_keeps_standalone_question():
    long_q = "Compare the latency and cost trade-offs of vector databases versus traditional keyword search engines"
    messages = [HumanMessage(content="Earlier question"), HumanMessage(content=long_q)]
    assert nodes._retrieval_query(messages) == long_q


def test_retrieval_query_ignores_small_talk_and_merged_unanswered_messages():
    messages = [HumanMessage(content="hi"), AIMessage(content="Hello!"),
                HumanMessage(content="an unanswered question\n\nhow to install codex plugin?")]
    assert nodes._retrieval_query(messages, "how to install codex plugin?") == "how to install codex plugin?"
    state = {"messages": messages, "question": "how to install codex plugin?"}
    assert nodes._search_query(state) == "how to install codex plugin?"


def test_grader_sees_whole_excerpts():
    tail = "the answer is at the end of this chunk"
    content = "x" * 1100 + tail
    state = _state("how does this library work?", retrieved_chunks=[_chunk("c1", "s1", content, 0.8)])
    grader_input = nodes._grader_input(state)
    assert "[1] LIBRARY · Doc" in grader_input
    assert tail in grader_input


def test_extract_query_keywords_drops_stopwords_and_keeps_terms():
    assert extract_query_keywords("Explain how GPT-4 compares to Llama for RAG in C++") == [
        "gpt-4", "compares", "llama", "rag", "c++",
    ]
    assert keyword_overlap(["llama", "rag"], "Llama models are often used for RAG.") == 1.0
    assert keyword_overlap([], "anything") == 0.0


def test_keyword_overlap_matches_whole_words_and_plurals():
    assert keyword_overlap(["coding"], "Positional decoding and encoding") == 0.0
    assert keyword_overlap(["dead"], "Deadlift form") == 0.0
    assert keyword_overlap(["agent"], "Agents call tools") == 1.0
    assert keyword_overlap(["c++", "gpt-4"], "Written in C++ against GPT-4.") == 1.0


def test_keyword_overlap_weights_rare_terms():
    weights = idf_weights({"vibe": 9, "coding": 214}, 3868)
    assert keyword_overlap(["vibe", "coding"], "we spend all day coding", weights) < 0.4
    assert keyword_overlap(["vibe", "coding"], "is vibe coding over?", weights) == 1.0
    # A term the library never mentions can't be covered by the generic ones
    weights = idf_weights({"karpathy": 0, "coding": 214}, 3868)
    assert keyword_overlap(["karpathy", "coding"], "we spend all day coding", weights) < 0.3


# ---------------------------------------------------------------------------
# Library relevance filtering
# ---------------------------------------------------------------------------
def _chunk(cid, source_id, content, similarity, title="Doc", **extra):
    return {"id": cid, "source_id": source_id, "source_title": title, "content": content,
            "similarity": similarity, "chunk_index": 0, **extra}


def test_irrelevant_chunks_are_dropped_so_web_fallback_can_trigger():
    candidates = [_chunk("c1", "s1", "Recipes for sourdough bread", 0.31)]
    assert nodes.select_relevant_chunks(candidates, ["transformer", "attention"], set(), {}) == []


def test_relevance_by_similarity_or_keywords_with_boosts():
    candidates = [
        _chunk("c1", "s1", "Unrelated wording but semantically close", 0.71),
        _chunk("c2", "s2", "Transformer attention scales quadratically", 0.40),
        _chunk("c3", "s3", "Attached paper intro", 0.53),
        _chunk("c4", "s4", "Graph-linked doc on attention", 0.60),
    ]
    selected = nodes.select_relevant_chunks(
        candidates, ["transformer", "attention"], session_source_ids={"s3"}, graph_sources={"s4": ["Attention"]},
    )
    by_id = {c["id"]: c for c in selected}
    assert set(by_id) == {"c1", "c2", "c3", "c4"}
    assert by_id["c2"]["keyword_overlap"] == 1.0
    assert by_id["c3"]["retrieved_via"] == "session"
    assert by_id["c4"]["retrieved_via"] == "graph"
    assert by_id["c4"]["matched_entities"] == ["Attention"]
    assert [c["score"] for c in selected] == sorted((c["score"] for c in selected), reverse=True)


def test_weak_matches_do_not_count_as_library_evidence():
    candidates = [
        _chunk("c1", "s1", "A graph link alone doesn't lower the bar", 0.50),
        _chunk("c2", "s2", "puppy appears, the other term does not", 0.45),
    ]
    assert nodes.select_relevant_chunks(candidates, ["puppy", "agility"], set(), {"s1": ["Train"]}) == []


def test_moderate_similarity_needs_the_questions_distinctive_terms():
    # A payments podcast that talks about coding, retrieved for a vibe coding question
    weights = idf_weights({"vibe": 9, "coding": 214, "trend": 19}, 3868)
    keywords = ["vibe", "coding", "trend"]
    candidates = [
        _chunk("upi", "s1", "People spend their time coding and building stuff", 0.63, title="If UPI Is Free"),
        _chunk("on-topic", "s2", "Vibe coding is maturing into spec-driven coding", 0.60),
        _chunk("close", "s3", "Semantically very close, different words", 0.70),
    ]
    selected = nodes.select_relevant_chunks(candidates, keywords, set(), {}, weights)
    assert {c["id"] for c in selected} == {"on-topic", "close"}


def test_moderate_similarity_is_enough_without_keywords():
    candidates = [_chunk("c1", "s1", "Anything", 0.60)]
    assert [c["id"] for c in nodes.select_relevant_chunks(candidates, [], set(), {})] == ["c1"]


def test_selection_caps_chunks_per_source_and_total(monkeypatch):
    monkeypatch.setattr(settings, "RAG_MAX_CHUNKS_PER_SOURCE", 2)
    monkeypatch.setattr(settings, "RAG_MAX_CHUNKS", 3)
    candidates = [_chunk(f"a{i}", "s1", "x", 0.9 - i * 0.01) for i in range(5)]
    candidates += [_chunk(f"b{i}", "s2", "x", 0.8 - i * 0.01) for i in range(5)]
    selected = nodes.select_relevant_chunks(candidates, [], set(), {})
    assert [c["id"] for c in selected] == ["a0", "a1", "b0"]


def test_intro_chunks_always_kept_for_summaries():
    candidates = [_chunk("c1", "s1", "Opening paragraph", 0.2, is_intro=True)]
    assert [c["id"] for c in nodes.select_relevant_chunks(candidates, ["summary"], {"s1"}, {})] == ["c1"]


# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------
GRAPH_EVIDENCE = {
    "entities": [{
        "label": "Attention",
        "type": "Concept",
        "documents": [{"id": "s4", "title": "Attention Is All You Need"}],
        "neighbors": [{"label": "Transformer", "type": "Technology"}],
    }],
    "memories": ["User explored: 'LLMs' (Concept)"],
}


def test_format_graph_facts():
    assert format_graph_facts(GRAPH_EVIDENCE) == (
        "- Attention (Concept) — mentioned in: 'Attention Is All You Need'; related to: Transformer (Technology)"
    )
    assert format_graph_facts({}) == ""


async def test_graph_retrieval_uses_user_scoped_engine(monkeypatch):
    calls = {}

    class FakeEngine:
        def get_graph_evidence(self, query, user_id):
            calls["evidence"] = (query, user_id)
            return GRAPH_EVIDENCE

        def get_related_sources_from_graph(self, query, user_id, limit):
            calls["sources"] = (query, user_id, limit)
            return [{"source_id": "s4", "matched_entities": ["Attention"]}, {"source_id": None}]

    import app.graph.engine as engine_module
    monkeypatch.setattr(engine_module, "graph_engine", FakeEngine())

    evidence, graph_sources = await nodes._graph_retrieval("how does attention work", "user-1")

    assert evidence is GRAPH_EVIDENCE
    assert graph_sources == {"s4": ["Attention"]}
    assert calls["evidence"] == ("how does attention work", "user-1")
    assert calls["sources"][1] == "user-1"


# ---------------------------------------------------------------------------
# Web search routing
# ---------------------------------------------------------------------------
def _state(text: str, **extra):
    return {"messages": [HumanMessage(content=text)], **extra}


def test_no_web_search_without_provider_key(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    assert nodes.should_search_web(_state("latest results on protein folding models", needs_web_search=True)) == "generate"


def test_forced_web_search(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    state = _state("hi", needs_web_search=True, retrieved_chunks=[{"content": "x"}])
    assert nodes.should_search_web(state) == "web_search"


def test_library_miss_waits_for_the_library_retry_before_the_web(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    state = _state("what changed in the latest transformer architectures", retrieved_chunks=[], graph_evidence=GRAPH_EVIDENCE)
    assert nodes.should_search_web(state) == "generate"


def test_no_auto_web_search_for_small_talk_or_grounded_answers(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    assert nodes.should_search_web(_state("thanks!", retrieved_chunks=[])) == "generate"
    grounded = _state("summarize the key findings of this paper", retrieved_chunks=[{"content": "x"}])
    assert nodes.should_search_web(grounded) == "generate"


async def test_chat_web_search_never_returns_placeholders(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    assert await WebSearchTool().search("anything", allow_fallback=False) == []
    assert (await nodes.web_search_node(_state("latest research on sparse attention")))["web_search_results"] == []


async def test_web_search_node_requests_advanced_depth(monkeypatch):
    captured = {}

    async def fake_search(self, **kwargs):
        captured.update(kwargs)
        return [{"title": "A", "url": "https://a.dev", "snippet": "text"}, {"title": "B", "url": "", "snippet": "x"}]

    monkeypatch.setattr(WebSearchTool, "search", fake_search)
    result = await nodes.web_search_node(_state("latest research on sparse attention"))
    assert captured["search_depth"] == "advanced"
    assert captured["allow_fallback"] is False
    assert [r["url"] for r in result["web_search_results"]] == ["https://a.dev"]
    assert result["searched"] == [{"source": "web", "query": "latest research on sparse attention", "found": 1}]


async def test_web_retry_uses_rewritten_query_and_keeps_earlier_results(monkeypatch):
    captured = {}

    async def fake_search(self, **kwargs):
        captured.update(kwargs)
        return [{"title": "A", "url": "https://a.dev", "snippet": "dup"}, {"title": "C", "url": "https://c.dev", "snippet": "new"}]

    monkeypatch.setattr(WebSearchTool, "search", fake_search)
    state = _state(
        "what about its limitations?",
        search_query="sparse attention limitations long context",
        web_search_results=[{"title": "A", "url": "https://a.dev", "snippet": "old"}],
        searched=[{"source": "library", "query": "q", "found": 0}],
    )
    result = await nodes.web_search_node(state)
    assert captured["query"] == "sparse attention limitations long context"
    assert [(r["url"], r["snippet"]) for r in result["web_search_results"]] == [("https://a.dev", "old"), ("https://c.dev", "new")]
    assert [s["source"] for s in result["searched"]] == ["library", "web"]


def test_retry_goes_straight_to_evidence_check(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    state = _state("what changed in the latest transformer architectures", retrieved_chunks=[], retrieval_attempts=1)
    assert nodes.should_search_web(state) == "generate"


def test_merge_chunks_dedupes_and_reranks():
    previous = [_chunk("c1", "s1", "x", 0.6, score=0.6), _chunk("c2", "s2", "y", 0.5, score=0.5)]
    new = [_chunk("c2", "s2", "y", 0.5, score=0.9), _chunk("c3", "s3", "z", 0.7, score=0.7)]
    assert [(c["id"], c["score"]) for c in nodes.merge_chunks(previous, new)] == [("c2", 0.9), ("c3", 0.7), ("c1", 0.6)]


# ---------------------------------------------------------------------------
# Evidence check, query rewriting & source switching
# ---------------------------------------------------------------------------
class FakeGrader:
    def __init__(self, reply: str):
        self.reply = reply
        self.calls = []

    async def ainvoke(self, messages, config=None):
        self.calls.append((messages, config))
        return AIMessage(content=self.reply)


def test_parse_verdict():
    reply = (
        '```json\n{"sufficient": false, "reason": "Off topic", "action": "web",'
        ' "queries": ["a", "A", " b ", "c", "d"], "drop": [2, "3", "x"]}\n```'
    )
    assert nodes.parse_verdict(reply) == {
        "sufficient": False, "reason": "Off topic", "action": "web", "queries": ["a", "b", "c"], "drop": [2, 3],
    }
    assert nodes.parse_verdict("not json") is None
    assert nodes.parse_verdict('{"sufficient": "maybe"}') is None
    # Sufficient always answers, whatever action came with it
    assert nodes.parse_verdict('{"sufficient": true, "action": "web", "queries": ["x"]}')["action"] == "answer"


def test_parse_verdict_reads_the_older_format_as_a_library_retry():
    verdict = nodes.parse_verdict('{"sufficient": false, "reason": "Off topic", "query": "sparse attention limits"}')
    assert verdict["action"] == "library"
    assert verdict["queries"] == ["sparse attention limits"]
    assert verdict["drop"] == []


def test_plan_queries_never_repeat_a_search_on_the_same_source():
    state = _state("q", searched=[{"source": "library", "query": "q"}])
    assert nodes.plan_queries(state, {"queries": ["better q", "Q"]}, "library") == ["better q"]
    assert nodes.plan_queries(state, {"queries": ["Q"]}, "library") == []
    assert nodes.plan_queries(state, {"queries": ["Q"]}, "web") == ["Q"]
    # No queries written: the question itself, unless it already ran there
    assert nodes.plan_queries(state, {"queries": []}, "library") == []
    assert nodes.plan_queries(state, {"queries": []}, "web") == ["q"]


async def test_library_miss_retries_the_library_with_a_rewritten_query(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    grader = FakeGrader('{"sufficient": false, "reason": "Only tangential", "query": "RAG evaluation benchmarks 2026"}')
    monkeypatch.setattr(nodes, "grader_llm", grader)
    state = _state(
        "which benchmarks evaluate retrieval augmented generation?",
        retrieved_chunks=[],
        searched=[{"source": "library", "query": "which benchmarks evaluate retrieval augmented generation?", "found": 0}],
    )

    result = await nodes.evaluate_evidence_node(state)

    assert result["next_source"] == "library"
    assert result["search_query"] == "RAG evaluation benchmarks 2026"
    assert result["retrieval_attempts"] == 1
    assert nodes.route_after_evaluation({**state, **result}) == "retrieve"
    _, config = grader.calls[0]
    assert config["tags"] == [nodes.GRADER_TAG]


async def test_web_tops_up_once_when_the_retry_budget_runs_out(monkeypatch):
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    monkeypatch.setattr(settings, "CHAT_MAX_RETRIEVAL_RETRIES", 1)
    question = "which benchmarks evaluate retrieval augmented generation?"
    library_search = {"source": "library", "query": "rewritten", "found": 1}
    chunks = [_chunk("c1", "s1", "RAG benchmarks", 0.6)]

    after_retry = _state(question, retrieved_chunks=chunks, retrieval_attempts=1, searched=[library_search])
    assert nodes.route_after_evaluation(await nodes.evaluate_evidence_node(after_retry)) == "web_search"

    web_search = {"source": "web", "query": "rewritten", "found": 3}
    after_web = {**after_retry, "searched": [library_search, web_search]}
    assert nodes.route_after_evaluation(await nodes.evaluate_evidence_node(after_web)) == "generate"


async def test_first_pass_library_hit_is_answered_ungraded_when_first_pass_grading_is_off(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    monkeypatch.setattr(settings, "CHAT_GRADE_FIRST_PASS", False)
    grader = FakeGrader('{"sufficient": false, "reason": "Partial", "action": "web", "queries": ["better query"]}')
    monkeypatch.setattr(nodes, "grader_llm", grader)
    state = _state(
        "which benchmarks evaluate retrieval augmented generation?",
        retrieved_chunks=[_chunk("c1", "s1", "RAG combines retrieval and generation.", 0.6, title="RAG paper")],
    )

    result = await nodes.evaluate_evidence_node(state)

    assert nodes.route_after_evaluation({**state, **result}) == "generate"
    assert grader.calls == []


async def test_sufficient_evidence_or_no_retries_left_goes_to_generate(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    grader = FakeGrader('{"sufficient": true, "reason": "Direct answer", "query": ""}')
    monkeypatch.setattr(nodes, "grader_llm", grader)
    question = "which benchmarks evaluate retrieval augmented generation?"

    result = await nodes.evaluate_evidence_node(_state(question, retrieved_chunks=[_chunk("c1", "s1", "x", 0.8)]))
    assert nodes.route_after_evaluation(result) == "generate"

    calls = len(grader.calls)
    exhausted = await nodes.evaluate_evidence_node(_state(question, retrieval_attempts=settings.CHAT_MAX_RETRIEVAL_RETRIES))
    small_talk = await nodes.evaluate_evidence_node(_state("thanks!"))
    assert nodes.route_after_evaluation(exhausted) == nodes.route_after_evaluation(small_talk) == "generate"
    assert len(grader.calls) == calls  # no grading call spent on either


async def test_grader_failure_answers_with_current_evidence(monkeypatch):
    class BrokenGrader:
        async def ainvoke(self, messages, config=None):
            raise RuntimeError("429 RESOURCE_EXHAUSTED")

    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    monkeypatch.setattr(nodes, "grader_llm", BrokenGrader())
    state = _state("which benchmarks evaluate retrieval augmented generation?")
    assert nodes.route_after_evaluation(await nodes.evaluate_evidence_node(state)) == "generate"
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    assert nodes.route_after_evaluation(await nodes.evaluate_evidence_node(state)) == "web_search"


QUESTION = "which benchmarks evaluate retrieval augmented generation?"


async def test_first_pass_library_hit_is_graded(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    grader = FakeGrader('{"sufficient": true, "reason": "Direct answer", "action": "answer", "queries": [], "drop": []}')
    monkeypatch.setattr(nodes, "grader_llm", grader)
    state = _state(QUESTION, retrieved_chunks=[_chunk("c1", "s1", "RAG benchmarks", 0.7)])

    result = await nodes.evaluate_evidence_node(state)

    assert len(grader.calls) == 1
    assert nodes.route_after_evaluation({**state, **result}) == "generate"
    assert result["evidence_verdict"]["sufficient"] is True


async def test_grader_can_pick_the_web_with_its_own_queries(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    grader = FakeGrader(
        '{"sufficient": false, "reason": "Needs recent results", "action": "web",'
        ' "queries": ["RAG benchmarks 2026", "RAGAS evaluation metrics"]}'
    )
    monkeypatch.setattr(nodes, "grader_llm", grader)
    state = _state(QUESTION, retrieved_chunks=[_chunk("c1", "s1", "RAG overview", 0.7)],
                   searched=[{"source": "library", "query": QUESTION, "found": 1}])

    result = await nodes.evaluate_evidence_node(state)

    assert nodes.route_after_evaluation({**state, **result}) == "web_search"
    assert result["search_queries"] == ["RAG benchmarks 2026", "RAGAS evaluation metrics"]
    assert result["search_query"] == "RAG benchmarks 2026"
    assert result["retrieval_attempts"] == 1
    assert "- web: live web search" in grader.calls[0][0][0].content


async def test_web_choice_without_a_provider_falls_back_to_the_library(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
    grader = FakeGrader('{"sufficient": false, "reason": "x", "action": "web", "queries": ["RAG benchmarks"]}')
    monkeypatch.setattr(nodes, "grader_llm", grader)
    state = _state(QUESTION, retrieved_chunks=[], searched=[{"source": "library", "query": QUESTION, "found": 0}])

    result = await nodes.evaluate_evidence_node(state)
    assert result["next_source"] == "library"
    assert result["search_queries"] == ["RAG benchmarks"]
    assert "- web:" not in grader.calls[0][0][0].content

    # Nothing new to run anywhere: answer with what there is
    repeat = {**state, "searched": [*state["searched"], {"source": "library", "query": "RAG benchmarks", "found": 0}]}
    assert nodes.route_after_evaluation(await nodes.evaluate_evidence_node(repeat)) == "generate"


async def test_grader_drops_off_topic_sources_and_they_never_come_back(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    # Sources as numbered for the grader: [1] s1, [2] s2 (library), [3] web page
    grader = FakeGrader('{"sufficient": true, "reason": "s1 answers it", "action": "answer", "drop": [2, 3, 9]}')
    monkeypatch.setattr(nodes, "grader_llm", grader)
    state = _state(
        QUESTION,
        retrieved_chunks=[_chunk("c1", "s1", "RAG benchmarks", 0.8, score=0.8),
                          _chunk("c2", "s2", "Sourdough recipes", 0.6, title="Bread", score=0.6)],
        web_search_results=[{"title": "W", "url": "https://w.dev", "snippet": "unrelated"}],
    )

    result = await nodes.evaluate_evidence_node(state)

    assert [c["id"] for c in result["retrieved_chunks"]] == ["c1"]
    assert result["web_search_results"] == []
    assert sorted(result["rejected"]) == ["https://w.dev", "s2"]
    assert nodes.route_after_evaluation({**state, **result}) == "generate"

    # A later search doesn't bring dropped sources back
    later = nodes.merge_chunks(result["retrieved_chunks"], [_chunk("c3", "s2", "More bread", 0.9, score=0.9)],
                               result["rejected"])
    assert [c["id"] for c in later] == ["c1"]


async def test_dropping_every_source_never_answers_from_nothing(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(settings, "TAVILY_API_KEY", "key")
    monkeypatch.setattr(nodes, "grader_llm", FakeGrader('{"sufficient": true, "reason": "ok", "drop": [1]}'))
    state = _state(QUESTION, retrieved_chunks=[_chunk("c1", "s1", "RAG benchmarks", 0.8)])

    result = await nodes.evaluate_evidence_node(state)

    assert "retrieved_chunks" not in result  # Contradictory verdict: the evidence is kept
    assert nodes.route_after_evaluation({**state, **result}) == "generate"


async def test_web_search_skips_pages_set_aside_earlier(monkeypatch):
    async def fake_search(self, **kwargs):
        return [{"title": "A", "url": "https://a.dev", "snippet": "a"}, {"title": "B", "url": "https://b.dev", "snippet": "b"}]

    monkeypatch.setattr(WebSearchTool, "search", fake_search)
    result = await nodes.web_search_node(_state(QUESTION, rejected=["https://a.dev"]))
    assert [r["url"] for r in result["web_search_results"]] == ["https://b.dev"]


async def test_web_search_runs_every_planned_query(monkeypatch):
    queries = []

    async def fake_search(self, **kwargs):
        queries.append(kwargs["query"])
        return [{"title": kwargs["query"], "url": f"https://{len(queries)}.dev", "snippet": "s"}]

    monkeypatch.setattr(WebSearchTool, "search", fake_search)
    result = await nodes.web_search_node(_state(QUESTION, search_queries=["part one", "part two"]))
    assert sorted(queries) == ["part one", "part two"]
    assert len(result["web_search_results"]) == 2
    assert [(s["query"], s["found"]) for s in result["searched"]] == [("part one", 1), ("part two", 1)]


async def test_retrieve_runs_every_planned_query(monkeypatch):
    async def fake_embeddings(texts, user_id=None):
        return [[0.1] for _ in texts]

    async def fake_library_search(db, user_uuid, query, embedding, session_source_uuids, graph_sources):
        return [_chunk(f"c-{query}", f"s-{query}", query, 0.8, score=0.8)]

    async def fake_memories(**kwargs):
        return []

    async def fake_graph(query, user_id):
        return {"entities": [], "memories": []}, {}

    import app.services.memory_service as memory_service
    monkeypatch.setattr(nodes, "generate_embeddings", fake_embeddings)
    monkeypatch.setattr(nodes, "_library_search", fake_library_search)
    monkeypatch.setattr(nodes, "_graph_retrieval", fake_graph)
    monkeypatch.setattr(memory_service, "retrieve_session_memories", fake_memories)

    state = _state(QUESTION, user_id="00000000-0000-0000-0000-000000000001", search_queries=["one", "two"],
                   retrieved_chunks=[_chunk("c0", "s0", "earlier", 0.7, score=0.7)], rejected=["s-two"])
    result = await nodes.retrieve_node(state, {"configurable": {"db": object()}})

    assert [c["id"] for c in result["retrieved_chunks"]] == ["c-one", "c0"]
    assert [(s["query"], s["found"]) for s in result["searched"]] == [("one", 1), ("two", 0)]


async def test_generate_mentions_rewritten_searches(monkeypatch):
    limiter_backend.reset()
    fake = FakeLLM("Benchmarks include X [1].")
    monkeypatch.setattr(nodes, "llm", fake)
    await nodes.generate_node({
        "user_id": "u",
        "messages": [HumanMessage(content="which benchmarks evaluate RAG?")],
        "web_search_results": [{"title": "Bench", "url": "https://b.dev", "snippet": "..."}],
        "retrieval_attempts": 1,
        "searched": [{"source": "library", "query": "which benchmarks evaluate RAG?"},
                     {"source": "web", "query": "RAG evaluation benchmarks"}],
    })
    assert 'searched again. Searches run: library "which benchmarks evaluate RAG?"; web "RAG evaluation benchmarks"' in fake.calls[0][0].content


def test_only_answer_tokens_are_streamed():
    from app.services.chat_service import _is_answer_token
    assert _is_answer_token({"metadata": {"langgraph_node": "generate"}})
    assert not _is_answer_token({"metadata": {"langgraph_node": "evaluate"}})
    assert not _is_answer_token({"tags": [nodes.GRADER_TAG], "metadata": {"langgraph_node": "generate"}})


# ---------------------------------------------------------------------------
# generate_node
# ---------------------------------------------------------------------------
class FakeLLM:
    def __init__(self, reply: str):
        self.reply = reply
        self.calls = []

    async def ainvoke(self, messages):
        self.calls.append(messages)
        return AIMessage(content=self.reply)


def test_numbered_sources_order_library_graph_web():
    chunks = [_chunk("c1", "s1", "RAG combines retrieval and generation.", 0.8, title="RAG paper", retrieved_via="library")]
    web = [{"title": "Survey", "url": "https://example.org/survey", "snippet": "A survey."}]
    sources = nodes.build_numbered_sources(chunks, GRAPH_EVIDENCE, web)
    assert [s["kind"] for s in sources] == ["library", "graph", "web"]
    assert sources[1]["source_title"] == "Knowledge graph: Attention"
    assert sources[2]["canonical_uri"] == "https://example.org/survey"


async def test_generate_cites_library_graph_and_web(monkeypatch):
    limiter_backend.reset()
    fake = FakeLLM("RAG grounds answers [1]. Attention links the papers [2]. A survey extends it [3].")
    monkeypatch.setattr(nodes, "llm", fake)

    history = [HumanMessage(content="What is RAG?"), AIMessage(content="Retrieval-augmented generation."),
               HumanMessage(content="Any recent work?")]
    state = {
        "user_id": "user-123",
        "messages": history,
        "retrieved_chunks": [_chunk("c1", "s1", "RAG combines retrieval and generation.", 0.8, title="RAG paper")],
        "graph_evidence": GRAPH_EVIDENCE,
        "web_search_results": [{"title": "New RAG survey", "url": "https://example.org/survey", "snippet": "A 2026 survey."}],
    }

    result = await nodes.generate_node(state)

    system = fake.calls[0][0]
    assert isinstance(system, SystemMessage)
    assert "ANSWER FORMAT (follow exactly)" in system.content
    assert "[1] LIBRARY · RAG paper" in system.content
    assert "[2] KNOWLEDGE GRAPH · Knowledge graph: Attention" in system.content
    assert "[3] WEB · New RAG survey · https://example.org/survey" in system.content
    assert "USER CONTEXT" in system.content and "User explored: 'LLMs'" in system.content
    assert "Nothing in the user's library was relevant" not in system.content
    assert fake.calls[0][1:] == history

    citations = result["citations"]
    assert [(c["citation_index"], c["source_type"]) for c in citations] == [(1, "document"), (2, "graph"), (3, "web")]
    assert citations[2]["canonical_uri"] == "https://example.org/survey"


async def test_generate_web_only_adds_no_note_and_strict_citations(monkeypatch):
    limiter_backend.reset()
    fake = FakeLLM("Background only, no markers.")
    monkeypatch.setattr(nodes, "llm", fake)

    result = await nodes.generate_node({
        "user_id": "u",
        "messages": [HumanMessage(content="latest results on protein folding")],
        "web_search_results": [{"title": "Folding news", "url": "https://news.example/fold", "snippet": "..."}],
    })

    # The answer no longer opens with a note about which sources were (not) used
    assert "Nothing in the user's library was relevant" not in fake.calls[0][0].content
    # No [n] markers in the answer -> nothing is attributed to sources that weren't cited
    assert result["citations"] == []


async def test_generate_without_any_evidence_adds_no_context_note(monkeypatch):
    limiter_backend.reset()
    fake = FakeLLM("A short answer.")
    monkeypatch.setattr(nodes, "llm", fake)

    result = await nodes.generate_node({"user_id": "u", "messages": [HumanMessage(content="hello there")]})

    assert "No library sources, knowledge graph facts, or web results were found" in fake.calls[0][0].content
    assert result["citations"] == []


async def test_generate_splits_follow_ups_off_the_answer(monkeypatch):
    limiter_backend.reset()
    fake = FakeLLM(
        f"RAG grounds answers [1].\n- Retrieval runs first [1].\n\n{nodes.FOLLOW_UPS_MARKER}\n"
        "1. Why does the paper retrieve before generating?\n- \u201cHow is retrieval quality measured?\u201d\n"
    )
    monkeypatch.setattr(nodes, "llm", fake)

    result = await nodes.generate_node({
        "user_id": "u",
        "messages": [HumanMessage(content="What is RAG?")],
        "retrieved_chunks": [_chunk("c1", "s1", "RAG combines retrieval and generation.", 0.8, title="RAG paper")],
    })

    assert result["messages"][0].content == "RAG grounds answers [1].\n- Retrieval runs first [1]."
    assert result["follow_ups"] == ["Why does the paper retrieve before generating?", "How is retrieval quality measured?"]
    assert [c["citation_index"] for c in result["citations"]] == [1]


def test_split_follow_ups_without_marker_and_limits():
    assert nodes.split_follow_ups("Just an answer.\n") == ("Just an answer.", [])
    text = f"A.{nodes.FOLLOW_UPS_MARKER}\nOne?\none?\n\n{'x' * 200}?\nTwo?\nThree?"
    assert nodes.split_follow_ups(text, limit=2) == ("A.", ["One?", "Two?"])


# ---------------------------------------------------------------------------
# References & citations persistence helpers
# ---------------------------------------------------------------------------
RAW_CITATIONS = [
    {"citation_index": 3, "source_id": None, "source_title": "New [RAG] survey", "canonical_uri": "https://www.example.org/s",
     "source_type": "web", "content": "A survey."},
    {"citation_index": 1, "source_id": "11111111-1111-1111-1111-111111111111", "source_title": "RAG paper",
     "canonical_uri": None, "source_type": "pdf", "retrieved_via": "graph", "matched_entities": ["Attention"], "content": "x"},
    {"citation_index": 2, "source_id": None, "source_title": "Knowledge graph: Attention", "source_type": "graph", "content": "facts"},
    {"citation_index": 4, "source_id": "11111111-1111-1111-1111-111111111111", "source_title": "RAG paper dup"},
]


def test_format_citations_sorts_and_dedupes():
    formatted = format_citations(RAW_CITATIONS)
    assert [c["citation_index"] for c in formatted] == [1, 2, 3]
    assert formatted[0]["matched_entities"] == ["Attention"]


def test_references_markdown_uses_real_links():
    md = build_references_markdown(format_citations(RAW_CITATIONS))
    assert md.startswith(REFERENCES_MARKER)
    lines = md[len(REFERENCES_MARKER):].split("\n")
    assert lines == [
        "- [1] RAG paper",
        "- [2] Knowledge graph: Attention",
        "- [3] [New (RAG) survey](https://www.example.org/s)",
    ]
    assert build_references_markdown([]) == ""


def test_merge_consecutive_turns():
    merged = merge_consecutive_turns([
        HumanMessage(content="first question"),
        HumanMessage(content="retry"),
        AIMessage(content="answer"),
    ])
    assert [type(m) for m in merged] == [HumanMessage, AIMessage]
    assert merged[0].content == "first question\n\nretry"


def test_session_create_ignores_legacy_mode():
    session = SessionCreate.model_validate({"title": "x", "mode": "ask"})
    assert not hasattr(session, "mode")


def test_chunk_from_row_handles_enum_source_type():
    row = SimpleNamespace(id="c", source_id="s", chunk_index=2, content="t", similarity=0.5,
                          source_title=None, canonical_uri=None, source_type=SimpleNamespace(value="youtube"))
    chunk = nodes._chunk_from_row(row)
    assert chunk["source_type"] == "youtube"
    assert chunk["source_title"] == "Document"
