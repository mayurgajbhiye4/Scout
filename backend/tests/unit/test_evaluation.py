"""RAGAS evaluation layer: metric selection, scoring, summaries, alerts, online sampling and the
contexts the answer node hands to it. The judge model is always faked; nothing here calls an API."""

import asyncio
import json
import random
import uuid
from types import SimpleNamespace

from langchain_core.messages import AIMessage, HumanMessage

from app.agent import nodes
from app.core.config import settings
from app.core.rate_limit import limiter_backend
from app.evaluation import metrics as metrics_module
from app.evaluation import online
from app.evaluation.cli import _load_testset
from app.evaluation.metrics import (
    OFFLINE_METRICS,
    ONLINE_METRICS,
    EvalSample,
    applicable_metrics,
    find_alerts,
    score_sample,
    summarize,
)


class FakeMetric:
    def __init__(self, name: str, value: float | None = None, fail: bool = False):
        self.name, self.value, self.fail = name, value, fail
        self.calls: list[dict] = []

    async def ascore(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise ValueError("judge returned invalid JSON")
        return SimpleNamespace(value=self.value)


def _fake_metrics(monkeypatch, values: dict[str, float | None], failing=()):
    built: dict[str, FakeMetric] = {}

    def build(name, has_reference):
        built[name] = FakeMetric(name, values.get(name), fail=name in failing)
        built[name].has_reference = has_reference
        return built[name]

    monkeypatch.setattr(metrics_module, "_build_metric", build)
    return built


# ── metric selection ────────────────────────────────────────────────────────


def test_context_metrics_are_skipped_without_contexts():
    sample = EvalSample(question="hi", answer="Hello! How can I help?")
    assert applicable_metrics(sample, ONLINE_METRICS) == ["answer_relevancy"]


def test_reference_metrics_need_a_reference():
    sample = EvalSample(question="q", answer="a", contexts=["c"])
    assert "context_recall" not in applicable_metrics(sample, OFFLINE_METRICS)
    assert "factual_correctness" not in applicable_metrics(sample, OFFLINE_METRICS)
    sample.reference = "r"
    assert applicable_metrics(sample, OFFLINE_METRICS) == list(OFFLINE_METRICS)


# ── scoring ─────────────────────────────────────────────────────────────────


async def test_score_sample_passes_each_metric_its_inputs(monkeypatch):
    built = _fake_metrics(
        monkeypatch, {"faithfulness": 0.9, "answer_relevancy": 0.8, "context_precision": 0.5}
    )
    sample = EvalSample(
        question="What is RAG?", answer="Retrieval + generation [1].", contexts=["[1] ..."]
    )

    result = await score_sample(sample, ONLINE_METRICS)

    assert result.scores == {"faithfulness": 0.9, "answer_relevancy": 0.8, "context_precision": 0.5}
    assert result.errors == {}
    assert built["faithfulness"].calls[0]["retrieved_contexts"] == ["[1] ..."]
    assert built["answer_relevancy"].calls[0] == {
        "user_input": "What is RAG?",
        "response": sample.answer,
    }
    # Without a reference, context precision is judged against the response
    assert built["context_precision"].has_reference is False
    assert "response" in built["context_precision"].calls[0]


async def test_reference_switches_context_precision_to_the_reference(monkeypatch):
    built = _fake_metrics(monkeypatch, {"context_precision": 1.0})
    sample = EvalSample(question="q", answer="a", contexts=["c"], reference="gold")

    await score_sample(sample, ("context_precision",))

    assert built["context_precision"].has_reference is True
    assert built["context_precision"].calls[0]["reference"] == "gold"


async def test_one_failing_metric_keeps_the_others(monkeypatch):
    _fake_metrics(
        monkeypatch, {"faithfulness": 0.7, "answer_relevancy": 0.9}, failing={"faithfulness"}
    )
    sample = EvalSample(question="q", answer="a", contexts=["c"])

    result = await score_sample(sample, ("faithfulness", "answer_relevancy"))

    assert result.scores == {"faithfulness": None, "answer_relevancy": 0.9}
    assert "invalid JSON" in result.errors["faithfulness"]


# ── summaries and alerts ────────────────────────────────────────────────────


def test_summarize_ignores_missing_scores():
    rows = [{"faithfulness": v} for v in (1.0, 0.5, 0.75, None)] + [{"answer_relevancy": None}]
    summary = summarize(rows)

    assert summary["faithfulness"]["count"] == 3
    assert summary["faithfulness"]["mean"] == 0.75
    assert summary["faithfulness"]["min"] == 0.5
    assert summary["answer_relevancy"] == {
        "count": 0,
        "mean": None,
        "median": None,
        "p10": None,
        "min": None,
    }


def test_alerts_fire_only_below_the_floor():
    summary = summarize([{"faithfulness": 0.6, "answer_relevancy": 0.9}])
    alerts = find_alerts(
        summary, {"faithfulness": 0.7, "answer_relevancy": 0.7, "context_precision": 0.5}
    )
    assert len(alerts) == 1
    assert alerts[0].startswith("faithfulness mean 0.60")


# ── online sampling ─────────────────────────────────────────────────────────


def test_online_eval_is_off_by_default():
    assert settings.EVAL_ONLINE_ENABLED is False
    assert online.should_sample(rate=1.0) is False


def test_sampling_follows_the_rate(monkeypatch):
    monkeypatch.setattr(settings, "EVAL_ONLINE_ENABLED", True)
    assert online.should_sample(rate=1.0) is True
    assert online.should_sample(rate=0.0) is False
    rng = random.Random(7)  # noqa: S311 - deterministic sampling test, not crypto
    hits = sum(online.should_sample(rate=0.2, rng=rng) for _ in range(2000))
    assert 300 < hits < 500


def test_nothing_is_scheduled_when_disabled():
    task = online.maybe_schedule_online_eval(
        message_id=uuid.uuid4(), session_id=uuid.uuid4(), question="q", answer="a", contexts=[]
    )
    assert task is None


async def test_sampled_turn_is_scored_and_stored(monkeypatch):
    monkeypatch.setattr(settings, "EVAL_ONLINE_ENABLED", True)
    monkeypatch.setattr(settings, "EVAL_ONLINE_SAMPLE_RATE", 1.0)
    _fake_metrics(
        monkeypatch, {"faithfulness": 0.4, "answer_relevancy": 0.95, "context_precision": 1.0}
    )

    saved = []

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def add(self, row):
            saved.append(row)

        async def commit(self):
            pass

    monkeypatch.setattr("app.db.session.async_session_factory", FakeSession)
    message_id, session_id = uuid.uuid4(), uuid.uuid4()

    task = online.maybe_schedule_online_eval(
        message_id=message_id,
        session_id=session_id,
        question="What is RAG?",
        answer="Retrieval-augmented generation [1].",
        contexts=["[1] LIBRARY · RAG paper\nRAG combines retrieval and generation."],
    )
    await asyncio.wait_for(task, timeout=5)

    assert len(saved) == 1
    row = saved[0]
    assert (row.message_id, row.session_id) == (message_id, session_id)
    assert (row.faithfulness, row.answer_relevancy, row.context_precision) == (0.4, 0.95, 1.0)
    assert row.context_count == 1
    assert row.errors is None


async def test_online_failure_never_raises(monkeypatch):
    monkeypatch.setattr(settings, "EVAL_ONLINE_ENABLED", True)
    monkeypatch.setattr(settings, "EVAL_ONLINE_SAMPLE_RATE", 1.0)

    async def boom(*args, **kwargs):
        raise RuntimeError("quota exhausted")

    monkeypatch.setattr(online, "score_sample", boom)
    task = online.maybe_schedule_online_eval(
        message_id=uuid.uuid4(), session_id=uuid.uuid4(), question="q", answer="a", contexts=[]
    )
    await asyncio.wait_for(task, timeout=5)  # logged, not raised


# ── what the answer node hands to RAGAS ─────────────────────────────────────


class FakeLLM:
    async def ainvoke(self, messages):
        return AIMessage(content="RAG retrieves then generates [1].")


async def test_generate_returns_the_source_blocks_as_contexts(monkeypatch):
    limiter_backend.reset()
    monkeypatch.setattr(nodes, "llm", FakeLLM())

    result = await nodes.generate_node(
        {
            "user_id": "u",
            "messages": [HumanMessage(content="what is rag")],
            "retrieved_chunks": [
                {
                    "source_id": "s1",
                    "source_title": "RAG paper",
                    "content": "RAG combines retrieval and generation.",
                    "chunk_index": 0,
                }
            ],
            "web_search_results": [
                {"title": "Blog", "url": "https://blog.example/rag", "snippet": "A RAG explainer."}
            ],
        }
    )

    assert len(result["contexts"]) == 2
    assert result["contexts"][0].startswith("[1] LIBRARY · RAG paper")
    assert "RAG combines retrieval and generation." in result["contexts"][0]
    assert result["contexts"][1].startswith("[2] WEB · Blog")


# ── test set files ──────────────────────────────────────────────────────────


def test_testset_accepts_ragas_and_hand_written_rows(tmp_path):
    path = tmp_path / "testset.jsonl"
    path.write_text(
        "\n".join(
            [
                json.dumps(
                    {"user_input": "q1", "reference": "r1", "synthesizer_name": "single_hop"}
                ),
                "",
                json.dumps({"question": "q2"}),
            ]
        ),
        encoding="utf-8",
    )
    rows = _load_testset(path)
    assert [r["question"] for r in rows] == ["q1", "q2"]
    assert rows[0]["synthesizer"] == "single_hop"
    assert rows[1]["reference"] is None and rows[1]["synthesizer"] == "manual"


# ── judge model settings ────────────────────────────────────────────────────


def test_judge_gets_room_to_think_and_reasoning_effort_is_optional(monkeypatch):
    import ragas.llms

    from app.evaluation import judge

    calls = []
    monkeypatch.setattr(ragas.llms, "llm_factory", lambda model, client, **kw: calls.append(kw))
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")

    for effort in ("low", ""):
        monkeypatch.setattr(settings, "EVAL_JUDGE_REASONING_EFFORT", effort)
        judge.judge_llm.cache_clear()
        judge.judge_llm()
    judge.judge_llm.cache_clear()

    # ragas' default 1024 tokens truncates a thinking model's JSON (IncompleteOutputException)
    assert calls[0] == {"max_tokens": settings.EVAL_JUDGE_MAX_TOKENS, "reasoning_effort": "low"}
    assert "reasoning_effort" not in calls[1]


def test_judge_needs_a_key(monkeypatch):
    import pytest

    from app.evaluation import judge

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    judge.judge_llm.cache_clear()
    with pytest.raises(judge.JudgeUnavailable):
        judge.judge_llm()
