"""Which RAGAS metrics run, scoring one chat turn, and summarizing many.

Online (production) turns have no reference answer, so they get reference-free metrics only:
  faithfulness       Are the answer's claims supported by the retrieved contexts? (hallucination)
  answer_relevancy   Does the answer address the question that was asked?
  context_precision  Were the retrieved contexts useful for the answer that was given? (retrieval noise)

Offline runs over a test set also have a reference answer, which adds:
  context_recall     Did retrieval find everything the reference answer needs?
  factual_correctness  Does the answer agree with the reference answer?
and context_precision is judged against the reference instead of the response.

Every score is in [0, 1], higher is better. A metric that errors scores None and never sinks the others.
"""

import asyncio
import statistics
from dataclasses import dataclass, field

ONLINE_METRICS = ("faithfulness", "answer_relevancy", "context_precision")
OFFLINE_METRICS = (
    "faithfulness",
    "answer_relevancy",
    "context_precision",
    "context_recall",
    "factual_correctness",
)
# Metrics that judge the retrieved contexts; with no contexts they are skipped, not scored 0
CONTEXT_METRICS = {"faithfulness", "context_precision", "context_recall"}


@dataclass
class EvalSample:
    question: str
    answer: str
    contexts: list[str] = field(default_factory=list)
    reference: str | None = None


@dataclass
class EvalResult:
    scores: dict[str, float | None]
    errors: dict[str, str] = field(default_factory=dict)


def _build_metric(name: str, has_reference: bool):
    from ragas.metrics import collections as m

    from app.evaluation.judge import judge_embeddings, judge_llm

    llm = judge_llm()
    if name == "faithfulness":
        return m.Faithfulness(llm=llm)
    if name == "answer_relevancy":
        return m.AnswerRelevancy(llm=llm, embeddings=judge_embeddings())
    if name == "context_precision":
        cls = (
            m.ContextPrecisionWithReference if has_reference else m.ContextPrecisionWithoutReference
        )
        return cls(llm=llm)
    if name == "context_recall":
        return m.ContextRecall(llm=llm)
    if name == "factual_correctness":
        return m.FactualCorrectness(llm=llm)
    raise ValueError(f"Unknown metric: {name}")


def _metric_inputs(name: str, sample: EvalSample) -> dict:
    """The arguments each metric's ascore() takes."""
    if name == "faithfulness":
        return {
            "user_input": sample.question,
            "response": sample.answer,
            "retrieved_contexts": sample.contexts,
        }
    if name == "answer_relevancy":
        return {"user_input": sample.question, "response": sample.answer}
    if name == "context_precision":
        if sample.reference:
            return {
                "user_input": sample.question,
                "reference": sample.reference,
                "retrieved_contexts": sample.contexts,
            }
        return {
            "user_input": sample.question,
            "response": sample.answer,
            "retrieved_contexts": sample.contexts,
        }
    if name == "context_recall":
        return {
            "user_input": sample.question,
            "retrieved_contexts": sample.contexts,
            "reference": sample.reference,
        }
    if name == "factual_correctness":
        return {"response": sample.answer, "reference": sample.reference}
    raise ValueError(f"Unknown metric: {name}")


def applicable_metrics(sample: EvalSample, requested: tuple[str, ...]) -> list[str]:
    """Drop metrics the sample can't be judged on (no contexts, or no reference answer)."""
    names = []
    for name in requested:
        if name in CONTEXT_METRICS and not sample.contexts:
            continue
        if name in ("context_recall", "factual_correctness") and not sample.reference:
            continue
        names.append(name)
    return names


async def score_sample(sample: EvalSample, metrics: tuple[str, ...] = ONLINE_METRICS) -> EvalResult:
    """Score one turn on each applicable metric, concurrently."""
    names = applicable_metrics(sample, metrics)

    async def run(name: str) -> tuple[str, float | None, str | None]:
        try:
            metric = _build_metric(name, has_reference=bool(sample.reference))
            result = await metric.ascore(**_metric_inputs(name, sample))
            value = result.value
            return name, (float(value) if value is not None else None), None
        except Exception as e:  # one failing metric (bad judge JSON, quota) keeps the others
            return name, None, f"{type(e).__name__}: {e}"[:500]

    outcomes = await asyncio.gather(*(run(n) for n in names))
    return EvalResult(
        scores={name: value for name, value, _ in outcomes},
        errors={name: err for name, _, err in outcomes if err},
    )


def summarize(rows: list[dict[str, float | None]]) -> dict[str, dict]:
    """Per metric: how many turns were scored, mean, median, 10th percentile and min."""
    names = sorted({k for row in rows for k in row})
    summary = {}
    for name in names:
        values = sorted(v for row in rows if (v := row.get(name)) is not None)
        if not values:
            summary[name] = {"count": 0, "mean": None, "median": None, "p10": None, "min": None}
            continue
        p10_index = max(0, int(round(0.1 * (len(values) - 1))))
        summary[name] = {
            "count": len(values),
            "mean": round(statistics.fmean(values), 4),
            "median": round(statistics.median(values), 4),
            "p10": round(values[p10_index], 4),
            "min": round(values[0], 4),
        }
    return summary


def alert_floors() -> dict[str, float]:
    from app.core.config import settings

    return {
        "faithfulness": settings.EVAL_ALERT_FAITHFULNESS,
        "answer_relevancy": settings.EVAL_ALERT_ANSWER_RELEVANCY,
        "context_precision": settings.EVAL_ALERT_CONTEXT_PRECISION,
    }


def find_alerts(summary: dict[str, dict], floors: dict[str, float] | None = None) -> list[str]:
    """Metrics whose mean fell below their floor."""
    floors = alert_floors() if floors is None else floors
    alerts = []
    for name, floor in floors.items():
        mean = (summary.get(name) or {}).get("mean")
        if mean is not None and mean < floor:
            alerts.append(f"{name} mean {mean:.2f} is below the floor {floor:.2f}")
    return alerts
