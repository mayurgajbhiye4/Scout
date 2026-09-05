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
        response = client.models.embed_content(
            model=settings.EMBEDDING_MODEL,
            contents=texts,
        )
        embeddings = [emb.values for emb in response.embeddings]
        return embeddings
    except Exception as e:
        logger.warning(
            "Gemini embedding API call failed, falling back to local embeddings",
            error=str(e),
        )
        return [generate_local_embedding(t, settings.EMBEDDING_DIMENSIONS) for t in texts]
