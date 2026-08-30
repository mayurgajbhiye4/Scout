from google import genai
from typing import List

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Initialize the new standard GenAI client
client = genai.Client(api_key=settings.GEMINI_API_KEY)


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for a list of texts using Google's new genai SDK.
    Uses models/text-embedding-004 which defaults to 768 dimensions.
    """
    if not texts:
        return []

    try:
        # The new SDK's client.models.embed_content accepts lists
        response = client.models.embed_content(
            model=settings.EMBEDDING_MODEL,
            contents=texts,
        )
        
        # response.embeddings is a list of Embedding objects.
        # Each object has a `values` attribute containing the float array.
        embeddings = [emb.values for emb in response.embeddings]
        return embeddings
        
    except Exception as e:
        logger.error("Failed to generate embeddings", error=str(e))
        raise
