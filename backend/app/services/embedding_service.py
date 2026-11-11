from typing import List

from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import enforce_pipeline_rate_limit

logger = get_logger(__name__)


class EmbeddingUnavailable(RuntimeError):
    """Gemini couldn't produce embeddings: no API key, a failed call, or an unusable response.

    There is deliberately no local fallback. Vectors from any other method live in a different space than
    the stored Gemini vectors, so saving them makes a source look indexed while no question can find it,
    and querying with them returns arbitrary chunks.
    """


def _api_key() -> str:
    key = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    return "" if key == "your-gemini-api-key-here" else key


async def generate_embeddings(texts: List[str], user_id: str | None = None) -> List[List[float]]:
    """Gemini embeddings for `texts`, one vector each, in order.

    Raises EmbeddingUnavailable when Gemini can't provide them. Ingestion turns that into a failed source;
    query-time callers skip semantic search for that request.
    Enforces pipeline-level embedding rate limits.
    """
    if not texts:
        return []

    enforce_pipeline_rate_limit(
        scope="pipeline:embedding",
        limit=settings.PIPELINE_EMBEDDING_RPM,
        window=60,
        identifier=user_id,
        description="Vector embedding generation",
    )

    api_key = _api_key()
    if not api_key:
        raise EmbeddingUnavailable("GEMINI_API_KEY is not configured")

    model_name = settings.EMBEDDING_MODEL
    if not model_name.startswith("models/"):
        model_name = f"models/{model_name}"

    try:
        from google import genai
        client = genai.Client(api_key=api_key)

        # Batch requests in chunks of up to 64 to respect the Gemini API <=100 limit
        batch_size = 64
        vectors: List[List[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = client.models.embed_content(
                model=model_name,
                contents=batch,
                config={"output_dimensionality": settings.EMBEDDING_DIMENSIONS},
            )
            vectors.extend(list(emb.values or []) for emb in (response.embeddings or []))
    except Exception as e:
        logger.warning("Gemini embedding call failed", error=str(e), texts=len(texts), model=settings.EMBEDDING_MODEL)
        raise EmbeddingUnavailable(f"Gemini embedding call failed: {e}") from e

    if len(vectors) != len(texts) or any(len(v) != settings.EMBEDDING_DIMENSIONS for v in vectors):
        logger.warning("Gemini returned unusable embeddings", expected=len(texts), received=len(vectors))
        raise EmbeddingUnavailable("Gemini returned an incomplete embedding response")
    return vectors
