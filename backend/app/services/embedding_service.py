import hashlib
import math
from typing import List

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def generate_local_embedding(text: str, dim: int = 768) -> List[float]:
    """
    Generate a deterministic normalized vector for development/testing
    when GEMINI_API_KEY is not configured.
    """
    vec = [0.0] * dim
    words = text.lower().split()
    if not words:
        words = ["empty"]
    for i, word in enumerate(words):
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        pos = h % dim
        vec[pos] += 1.0 / (1.0 + (i % 5))

    # Normalize vector to unit length (for cosine distance)
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    else:
        vec[0] = 1.0
    return vec


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for a list of texts using Google's GenAI SDK
    or deterministic local embeddings if GEMINI_API_KEY is missing.
    """
    if not texts:
        return []

    # Check if a valid API key is present
    api_key = getattr(settings, "GEMINI_API_KEY", "") or ""
    if not api_key or api_key.strip() == "" or api_key == "your-gemini-api-key-here":
        logger.warning(
            "GEMINI_API_KEY not configured. Generating deterministic 768-dim vector embeddings for dev/testing."
        )
        return [generate_local_embedding(t, settings.EMBEDDING_DIMENSIONS) for t in texts]

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        model_name = settings.EMBEDDING_MODEL
        if not model_name.startswith("models/"):
            model_name = f"models/{model_name}"

        # Batch requests in chunks of up to 64 to respect the Gemini API <=100 limit
        batch_size = 64
        all_embeddings: List[List[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = client.models.embed_content(
                model=model_name,
                contents=batch,
                config={"output_dimensionality": settings.EMBEDDING_DIMENSIONS},
            )
            all_embeddings.extend([emb.values for emb in response.embeddings])
        return all_embeddings
    except Exception as e:
        err_str = str(e)
        # Swallow 404 / NOT_FOUND errors silently and use deterministic local embeddings
        if "404" in err_str or "NOT_FOUND" in err_str:
            return [generate_local_embedding(t, settings.EMBEDDING_DIMENSIONS) for t in texts]

        logger.warning(
            "Gemini embedding API call failed, falling back to local embeddings",
            error=err_str,
        )
        return [generate_local_embedding(t, settings.EMBEDDING_DIMENSIONS) for t in texts]
