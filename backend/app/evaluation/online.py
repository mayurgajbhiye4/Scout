"""Online monitoring: score a sample of production chat turns in the background.

After an answer is saved, chat_service calls maybe_schedule_online_eval(). With EVAL_ONLINE_ENABLED and a
sampling hit, a detached task scores the turn with the reference-free metrics, saves an answer_evaluations
row and logs the scores. It runs after the done event, opens its own DB session, is capped by
EVAL_ONLINE_TIMEOUT_SECONDS, and swallows every error: monitoring never slows or breaks a chat reply.
"""

import asyncio
import random
import uuid

from app.core.config import settings
from app.core.logging import get_logger
from app.evaluation.metrics import ONLINE_METRICS, EvalSample, score_sample

logger = get_logger(__name__)

# Strong references so running tasks aren't garbage-collected mid-flight
_tasks: set[asyncio.Task] = set()


def should_sample(rate: float | None = None, rng: random.Random | None = None) -> bool:
    if not settings.EVAL_ONLINE_ENABLED:
        return False
    rate = settings.EVAL_ONLINE_SAMPLE_RATE if rate is None else rate
    if rate <= 0:
        return False
    return rate >= 1 or (rng or random).random() < rate


def maybe_schedule_online_eval(
    *,
    message_id: uuid.UUID,
    session_id: uuid.UUID,
    question: str,
    answer: str,
    contexts: list[str],
) -> asyncio.Task | None:
    """Start a background evaluation of this turn when it's sampled. Returns the task, or None."""
    if not answer.strip() or not should_sample():
        return None
    sample = EvalSample(question=question, answer=answer, contexts=contexts)
    task = asyncio.create_task(_evaluate_and_store(message_id, session_id, sample))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


async def _evaluate_and_store(
    message_id: uuid.UUID, session_id: uuid.UUID, sample: EvalSample
) -> None:
    from app.db.models.answer_evaluation import AnswerEvaluation
    from app.db.session import async_session_factory
    from app.evaluation.judge import judge_model

    try:
        result = await asyncio.wait_for(
            score_sample(sample, ONLINE_METRICS), timeout=settings.EVAL_ONLINE_TIMEOUT_SECONDS
        )
        async with async_session_factory() as db:
            db.add(
                AnswerEvaluation(
                    message_id=message_id,
                    session_id=session_id,
                    judge_model=judge_model(),
                    faithfulness=result.scores.get("faithfulness"),
                    answer_relevancy=result.scores.get("answer_relevancy"),
                    context_precision=result.scores.get("context_precision"),
                    context_count=len(sample.contexts),
                    errors=result.errors or None,
                )
            )
            await db.commit()
        # One structured line per scored answer, so log tooling can chart and alert on it too
        logger.info(
            "ragas_online_eval",
            message_id=str(message_id),
            session_id=str(session_id),
            contexts=len(sample.contexts),
            **{k: v for k, v in result.scores.items() if v is not None},
            errors=list(result.errors) or None,
        )
    except Exception as e:
        logger.warning(
            "RAGAS online evaluation failed",
            message_id=str(message_id),
            error=f"{type(e).__name__}: {e}",
        )
