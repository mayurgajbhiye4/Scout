"""RAGAS command line: synthetic test data, offline evaluation runs, and the online monitoring report.

Run from backend/ with the venv:
  python -m app.evaluation.cli generate-testset --user-email you@example.com --size 20
  python -m app.evaluation.cli run --user-email you@example.com --testset eval_data/testset.jsonl
  python -m app.evaluation.cli report --days 7

Test set format (JSON lines), so hand-written golden questions can sit next to synthetic ones:
  {"question": "...", "reference": "ideal answer", "reference_contexts": ["..."], "synthesizer": "..."}
"""

import argparse
import asyncio
import json
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.evaluation.metrics import (
    OFFLINE_METRICS,
    EvalSample,
    alert_floors,
    find_alerts,
    score_sample,
    summarize,
)

EVAL_DIR = Path("eval_data")
# Documents shorter than this give the generator too little to write a grounded question from
MIN_DOC_CHARS = 500
# Long documents are cut so one book doesn't dominate the knowledge graph (and the token bill)
MAX_DOC_CHARS = 20_000


# ── shared ──────────────────────────────────────────────────────────────────


async def _resolve_user_id(db, user_id: str | None, email: str | None) -> uuid.UUID:
    from app.db.models.user import User

    if user_id:
        return uuid.UUID(user_id)
    user = (await db.execute(select(User).where(User.email == email))).scalars().first()
    if not user:
        sys.exit(f"No user with email {email}")
    return user.id


def _load_testset(path: Path) -> list[dict]:
    rows = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        question = row.get("question") or row.get("user_input")
        if not question:
            sys.exit(f"{path}:{line_no} has no question")
        rows.append(
            {
                "question": question,
                "reference": row.get("reference"),
                "reference_contexts": row.get("reference_contexts") or [],
                "synthesizer": row.get("synthesizer") or row.get("synthesizer_name") or "manual",
            }
        )
    return rows


def _print_summary(summary: dict[str, dict], baseline: dict[str, dict] | None = None) -> None:
    floors = alert_floors()
    header = f"{'metric':<22}{'n':>5}{'mean':>8}{'median':>8}{'p10':>8}{'min':>8}"
    if baseline:
        header += f"{'vs base':>10}"
    print(header)
    print("-" * len(header))
    for name, s in summary.items():
        if s["mean"] is None:
            print(f"{name:<22}{0:>5}{'-':>8}")
            continue
        line = f"{name:<22}{s['count']:>5}{s['mean']:>8.3f}{s['median']:>8.3f}{s['p10']:>8.3f}{s['min']:>8.3f}"
        base_mean = ((baseline or {}).get(name) or {}).get("mean")
        if baseline and base_mean is not None:
            line += f"{s['mean'] - base_mean:>+10.3f}"
        if name in floors and s["mean"] < floors[name]:
            line += "   << below floor"
        print(line)


# ── generate-testset ────────────────────────────────────────────────────────


async def _library_documents(db, user_uuid: uuid.UUID, max_sources: int):
    """The user's indexed sources as LangChain documents (full text, or the chunks joined)."""
    from langchain_core.documents import Document

    from app.db.models.source import Source, SourceStatus
    from app.db.models.source_chunk import SourceChunk

    sources = (
        (
            await db.execute(
                select(Source)
                .where(Source.user_id == user_uuid, Source.status == SourceStatus.indexed)
                .order_by(Source.created_at.desc())
                .limit(max_sources)
            )
        )
        .scalars()
        .all()
    )
    docs = []
    for src in sources:
        text = src.content_text or ""
        if not text:
            chunks = (
                await db.execute(
                    select(SourceChunk.content)
                    .where(SourceChunk.source_id == src.id)
                    .order_by(SourceChunk.chunk_index)
                )
            ).scalars()
            text = "\n\n".join(chunks)
        if len(text) < MIN_DOC_CHARS:
            continue
        docs.append(
            Document(
                page_content=text[:MAX_DOC_CHARS],
                metadata={"source_id": str(src.id), "title": src.title},
            )
        )
    return docs


async def cmd_generate_testset(args) -> None:
    from ragas.testset.synthesizers.single_hop.specific import SingleHopSpecificQuerySynthesizer

    from app.db.session import async_session_factory
    from app.evaluation.judge import testset_generator

    async with async_session_factory() as db:
        user_uuid = await _resolve_user_id(db, args.user_id, args.user_email)
        docs = await _library_documents(db, user_uuid, args.max_sources)
    if not docs:
        sys.exit("No indexed sources with enough text. Add a few documents to the library first.")
    print(f"Building a test set of {args.size} questions from {len(docs)} sources...")

    generator = testset_generator()
    query_distribution = None
    if args.single_hop:
        query_distribution = [(SingleHopSpecificQuerySynthesizer(llm=generator.llm), 1.0)]
    # ragas runs its own event loop internally, so generation happens in a worker thread. A sample the
    # model refuses or garbles is skipped (raise_exceptions=False) instead of failing the whole set.
    testset = await asyncio.to_thread(
        generator.generate_with_langchain_docs,
        docs,
        testset_size=args.size,
        query_distribution=query_distribution,
        raise_exceptions=False,
    )

    df = testset.to_pandas()
    df = df[df["user_input"].apply(lambda q: isinstance(q, str) and bool(q.strip()))]
    if df.empty:
        sys.exit(
            "Every sample failed to generate. Check GEMINI_API_KEY / quota, or try --single-hop."
        )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for row in df.to_dict(orient="records"):
            record = {
                "question": row.get("user_input"),
                "reference": row.get("reference"),
                "reference_contexts": list(row.get("reference_contexts") or []),
                "synthesizer": row.get("synthesizer_name"),
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    df.to_csv(out.with_suffix(".csv"), index=False)
    skipped = args.size - len(df)
    print(f"Wrote {len(df)} samples to {out} (and {out.with_suffix('.csv')} for review)")
    if skipped > 0:
        print(f"{skipped} samples failed to generate and were skipped.")
    print("Read through them and delete or fix weak questions before using this as a baseline.")


# ── run ─────────────────────────────────────────────────────────────────────


async def _answer(question: str, user_uuid: uuid.UUID, force_web: bool) -> dict:
    """Run the real research agent for one question, the way chat does, with a throwaway session."""
    from langchain_core.messages import HumanMessage

    from app.agent.graph import build_graph
    from app.agent.nodes import _message_text
    from app.db.session import async_session_factory

    state = {
        "session_id": str(uuid.uuid4()),
        "user_id": str(user_uuid),
        "messages": [HumanMessage(content=question)],
        "question": question,
        "source_ids": [],
        "needs_web_search": force_web,
    }
    started = time.perf_counter()
    async with async_session_factory() as db:
        out = await build_graph().ainvoke(state, config={"configurable": {"db": db}})
    messages = out.get("messages") or []
    return {
        "answer": _message_text(messages[-1]) if messages else "",
        "contexts": out.get("contexts") or [],
        "searches": out.get("searched") or [],
        "retries": out.get("retrieval_attempts") or 0,
        "latency_s": round(time.perf_counter() - started, 2),
    }


async def cmd_run(args) -> None:
    from app.db.session import async_session_factory
    from app.evaluation.judge import judge_model

    # The pipeline limiter guards the server; this is a separate offline process
    settings.RATE_LIMIT_ENABLED = False

    rows = _load_testset(Path(args.testset))[: args.limit or None]
    async with async_session_factory() as db:
        user_uuid = await _resolve_user_id(db, args.user_id, args.user_email)
    metrics = tuple(args.metrics.split(",")) if args.metrics else OFFLINE_METRICS

    semaphore = asyncio.Semaphore(args.concurrency)

    async def evaluate(i: int, row: dict) -> dict:
        async with semaphore:
            record = {"index": i, **row}
            try:
                record.update(await _answer(row["question"], user_uuid, args.web))
                result = await score_sample(
                    EvalSample(
                        question=row["question"],
                        answer=record["answer"],
                        contexts=record["contexts"],
                        reference=row.get("reference"),
                    ),
                    metrics,
                )
                record["scores"], record["errors"] = result.scores, result.errors
            except Exception as e:
                record["scores"], record["errors"] = {}, {"pipeline": f"{type(e).__name__}: {e}"}
            done = ", ".join(f"{k}={v:.2f}" for k, v in record["scores"].items() if v is not None)
            print(f"[{i + 1}/{len(rows)}] {row['question'][:70]!r} {done or 'no scores'}")
            return record

    print(f"Evaluating {len(rows)} questions with {', '.join(metrics)} (judge: {judge_model()})")
    records = await asyncio.gather(*(evaluate(i, r) for i, r in enumerate(rows)))

    run_dir = Path(args.out_dir) / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    with (run_dir / "results.jsonl").open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
    _write_results_csv(run_dir / "results.csv", records)

    summary = summarize([r["scores"] for r in records])
    alerts = find_alerts(summary)
    (run_dir / "summary.json").write_text(
        json.dumps(
            {
                "run_at": datetime.now(UTC).isoformat(),
                "testset": str(args.testset),
                "questions": len(records),
                "answer_model": settings.LLM_MODEL,
                "judge_model": judge_model(),
                "pipeline_errors": sum(1 for r in records if "pipeline" in r["errors"]),
                "metrics": summary,
                "alerts": alerts,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    baseline = None
    if args.baseline:
        baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))["metrics"]
    print()
    _print_summary(summary, baseline)
    print(f"\nResults: {run_dir}")
    for alert in alerts:
        print(f"ALERT: {alert}")
    if args.fail_on_alert and alerts:
        sys.exit(1)


def _write_results_csv(path: Path, records: list[dict]) -> None:
    import csv

    metric_names = sorted({k for r in records for k in r["scores"]})
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "question",
                *metric_names,
                "contexts",
                "retries",
                "latency_s",
                "answer",
                "reference",
                "errors",
            ]
        )
        for r in records:
            writer.writerow(
                [
                    r["question"],
                    *(r["scores"].get(m) for m in metric_names),
                    len(r.get("contexts") or []),
                    r.get("retries"),
                    r.get("latency_s"),
                    r.get("answer", ""),
                    r.get("reference") or "",
                    json.dumps(r["errors"]) if r["errors"] else "",
                ]
            )


# ── report ──────────────────────────────────────────────────────────────────


async def cmd_report(args) -> None:
    from app.db.models.answer_evaluation import AnswerEvaluation
    from app.db.models.chat_message import ChatMessage
    from app.db.session import async_session_factory

    since = datetime.now(UTC) - timedelta(days=args.days)
    async with async_session_factory() as db:
        evals = (
            (
                await db.execute(
                    select(AnswerEvaluation)
                    .where(AnswerEvaluation.created_at >= since)
                    .order_by(AnswerEvaluation.created_at)
                )
            )
            .scalars()
            .all()
        )
        if not evals:
            print(f"No answers were evaluated in the last {args.days} days.")
            if not settings.EVAL_ONLINE_ENABLED:
                print(
                    "Online evaluation is off: set EVAL_ONLINE_ENABLED=true (and EVAL_ONLINE_SAMPLE_RATE)."
                )
            return

        rows = [
            {
                "faithfulness": e.faithfulness,
                "answer_relevancy": e.answer_relevancy,
                "context_precision": e.context_precision,
            }
            for e in evals
        ]
        summary = summarize(rows)
        print(f"Online RAGAS scores, last {args.days} days: {len(evals)} answers evaluated\n")
        _print_summary(summary)

        errored = sum(1 for e in evals if e.errors)
        no_context = sum(1 for e in evals if e.context_count == 0)
        print(f"\nAnswers with a metric error: {errored}   answered with no sources: {no_context}")

        # Daily trend, to spot a regression after a deploy or prompt change
        print(f"\n{'day':<12}{'n':>5}{'faith':>8}{'relev':>8}{'prec':>8}")
        by_day: dict[str, list] = {}
        for e in evals:
            by_day.setdefault(e.created_at.date().isoformat(), []).append(e)
        for day, items in by_day.items():
            day_summary = summarize(
                [
                    {
                        "faithfulness": e.faithfulness,
                        "answer_relevancy": e.answer_relevancy,
                        "context_precision": e.context_precision,
                    }
                    for e in items
                ]
            )

            def fmt(name: str, s: dict = day_summary) -> str:
                mean = s.get(name, {}).get("mean")
                return f"{mean:>8.2f}" if mean is not None else f"{'-':>8}"

            print(
                f"{day:<12}{len(items):>5}{fmt('faithfulness')}{fmt('answer_relevancy')}{fmt('context_precision')}"
            )

        # The least faithful answers are the ones to read first (likely hallucinations)
        worst = sorted(
            (e for e in evals if e.faithfulness is not None), key=lambda e: e.faithfulness
        )
        worst = worst[: args.worst]
        if worst:
            messages = {
                m.id: m
                for m in (
                    await db.execute(
                        select(ChatMessage).where(ChatMessage.id.in_([e.message_id for e in worst]))
                    )
                ).scalars()
            }
            print("\nLeast faithful answers (read these first):")
            for e in worst:
                msg = messages.get(e.message_id)
                preview = (msg.content if msg else "").replace("\n", " ")[:100]
                print(
                    f"  {e.faithfulness:.2f}  session {e.session_id}  message {e.message_id}\n        {preview}"
                )

    alerts = find_alerts(summary)
    for alert in alerts:
        print(f"ALERT: {alert}")
    if args.fail_on_alert and alerts:
        sys.exit(1)


# ── entry point ─────────────────────────────────────────────────────────────


def _add_user_args(parser: argparse.ArgumentParser) -> None:
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--user-id", help="Whose library to use")
    who.add_argument("--user-email", help="Whose library to use")


def main(argv: list[str] | None = None) -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        prog="python -m app.evaluation.cli", description=__doc__.split("\n\n")[0]
    )
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser(
        "generate-testset", help="Synthesize questions + reference answers from a library"
    )
    _add_user_args(gen)
    gen.add_argument("--size", type=int, default=20, help="Number of samples (default 20)")
    gen.add_argument(
        "--max-sources", type=int, default=30, help="Most recent indexed sources to use"
    )
    gen.add_argument("--out", default=str(EVAL_DIR / "testset.jsonl"))
    gen.add_argument(
        "--single-hop", action="store_true", help="Only single-document questions (small libraries)"
    )

    run = sub.add_parser("run", help="Answer every test question with the agent and score it")
    _add_user_args(run)
    run.add_argument("--testset", default=str(EVAL_DIR / "testset.jsonl"))
    run.add_argument("--out-dir", default=str(EVAL_DIR / "runs"))
    run.add_argument("--limit", type=int, default=0, help="Only the first N questions")
    run.add_argument("--concurrency", type=int, default=2, help="Questions in flight at once")
    run.add_argument("--metrics", help=f"Comma-separated subset of {','.join(OFFLINE_METRICS)}")
    run.add_argument("--web", action="store_true", help="Let every question search the web too")
    run.add_argument("--baseline", help="summary.json of an earlier run, to show the change")
    run.add_argument(
        "--fail-on-alert", action="store_true", help="Exit 1 when a metric is below its floor"
    )

    rep = sub.add_parser("report", help="Summarize online scores of production answers")
    rep.add_argument("--days", type=int, default=7)
    rep.add_argument("--worst", type=int, default=5, help="Least faithful answers to list")
    rep.add_argument(
        "--fail-on-alert", action="store_true", help="Exit 1 when a metric is below its floor"
    )

    args = parser.parse_args(argv)
    command = {"generate-testset": cmd_generate_testset, "run": cmd_run, "report": cmd_report}
    asyncio.run(command[args.command](args))


if __name__ == "__main__":
    main()
