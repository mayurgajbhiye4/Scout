"""
Unit tests for answer length limits and follow-up suggestions.
Tests:
- AnswerLineLimiter: pass-through under the limit, cut on a line boundary across deltas,
  code fences re-closed, trim note added
- Research prompt asks for precise answers and forbids ASCII diagrams / self-written references
- build_suggestions: graph relations, document concepts, library comparisons, de-duplication,
  skipping concepts already in the question, round-robin diversity, empty for web-only answers
- suggest_follow_ups: one graph lookup for cited documents, no LLM or web involvement
"""

from app.agent import nodes
from app.core.config import settings
from app.services import suggestion_service
from app.services.chat_service import AnswerLineLimiter
from app.services.suggestion_service import build_suggestions, suggest_follow_ups


# ---------------------------------------------------------------------------
# Line limiter
# ---------------------------------------------------------------------------
def test_limiter_passes_short_answers_untouched():
    limiter = AnswerLineLimiter(5)
    out = limiter.feed("line 1\nline 2\n") + limiter.feed("line 3")
    assert out == "line 1\nline 2\nline 3"
    assert not limiter.truncated
    assert limiter.closing() == ""


def test_limiter_cuts_on_line_boundary_across_deltas():
    limiter = AnswerLineLimiter(3)
    emitted = [limiter.feed("a\nb"), limiter.feed("\nc\nd\ne"), limiter.feed("more\n")]
    assert emitted == ["a\nb", "\nc", ""]
    assert limiter.text == "a\nb\nc"
    assert limiter.text.count("\n") + 1 == 3
    assert limiter.truncated
    assert limiter.closing() == "\n\n*Answer trimmed to the 3-line limit.*"


def test_limiter_closes_open_code_fence():
    limiter = AnswerLineLimiter(3)
    limiter.feed("Intro\n```python\nx = 1\ny = 2\n```")
    assert limiter.text == "Intro\n```python\nx = 1"
    assert limiter.closing().startswith("\n```\n\n*Answer trimmed")


def test_prompt_enforces_precision_and_no_ascii_diagrams():
    prompt = nodes.RESEARCH_SYSTEM_PROMPT
    assert f"never exceed {settings.CHAT_MAX_ANSWER_LINES} lines" in prompt
    assert "Never draw ASCII art" in prompt
    assert "{max_lines}" not in prompt
    assert "do not add follow-up question lists" in prompt


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------
GRAPH = {
    "entities": [
        {"label": "Attention", "type": "Concept", "documents": [],
         "neighbors": [{"label": "Transformer"}, {"label": "Positional Encoding"}]},
    ],
    "memories": [],
}
CHUNKS = [
    {"source_id": "s1", "source_title": "Attention Is All You Need"},
    {"source_id": "s1", "source_title": "Attention Is All You Need"},
    {"source_id": "s2", "source_title": "Let's build GPT"},
]
DOC_ENTITIES = [
    {"source_id": "s1", "source_title": "Attention Is All You Need", "label": "Multi-Head Attention"},
    {"source_id": "s2", "source_title": "Let's build GPT", "label": "Attention"},  # already in question
]


def test_suggestions_round_robin_across_kinds():
    suggestions = build_suggestions("How does attention work?", GRAPH, CHUNKS, DOC_ENTITIES, count=3)
    assert suggestions == [
        "How does Transformer relate to Attention?",
        "What does “Attention Is All You Need” say about Multi-Head Attention?",
        "Where do “Attention Is All You Need” and “Let's build GPT” agree or disagree?",
    ]


def test_suggestions_skip_concepts_already_asked_about():
    suggestions = build_suggestions("How do transformers use attention?", GRAPH, [], [], count=5)
    assert all("Transformer relate" not in s for s in suggestions)
    assert "How does Positional Encoding relate to Attention?" in suggestions


def test_suggestions_long_titles_are_shortened_and_deduped():
    long_title = "A" * 100
    chunks = [{"source_id": "x", "source_title": long_title}]
    suggestions = build_suggestions("question", None, chunks, [], count=5)
    assert suggestions == [f"What limitations or open questions does “{'A' * 59}…” raise?"]


def test_no_suggestions_for_web_only_answers():
    assert build_suggestions("latest news on fusion energy", {"entities": []}, [], [], count=3) == []


async def test_suggest_follow_ups_uses_one_graph_lookup_for_cited_docs(monkeypatch):
    calls = []

    class FakeEngine:
        def get_document_entities(self, source_ids, user_id):
            calls.append((source_ids, user_id))
            return DOC_ENTITIES

    import app.graph.engine as engine_module
    monkeypatch.setattr(engine_module, "graph_engine", FakeEngine())

    suggestions = await suggest_follow_ups(
        question="How does attention work?",
        user_id="user-1",
        graph_evidence=GRAPH,
        retrieved_chunks=CHUNKS,
        cited_source_ids=["s1", "s1"],
        count=2,
    )

    assert calls == [(["s1"], "user-1")]
    assert len(suggestions) == 2


async def test_suggest_follow_ups_without_sources_skips_graph(monkeypatch):
    called = False

    class FakeEngine:
        def get_document_entities(self, *args):
            nonlocal called
            called = True
            return []

    import app.graph.engine as engine_module
    monkeypatch.setattr(engine_module, "graph_engine", FakeEngine())

    assert await suggest_follow_ups("latest fusion news", "u", {"entities": []}, [], [], count=3) == []
    assert called is False
    assert suggestion_service.MAX_QUESTION_CHARS == 140
