import logging
from typing import Any

logger = logging.getLogger(__name__)


class SemanticReranker:
    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        """
        Initializes the CrossEncoder for semantic reranking.
        Defaults to a fast, lightweight cross-encoder for MVP.
        In production with bge-reranker-v2-m3, change the model_name.
        """
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            from sentence_transformers import CrossEncoder

            logger.info(f"Loading semantic reranker model: {self.model_name}")
            self.model = CrossEncoder(self.model_name)
        except ImportError:
            logger.warning(
                "Reranking DISABLED: sentence-transformers is not installed "
                "(pip install -r requirements.txt). Results are returned in retrieval order."
            )
        except Exception as e:
            logger.error(
                f"Reranking DISABLED: failed to load reranker model {self.model_name}: {e}. "
                "If HF_HUB_OFFLINE is on, the model may not be in the Hugging Face cache yet."
            )

    def rerank(
        self, query: str, documents: list[dict[str, Any]], top_k: int = 5
    ) -> list[dict[str, Any]]:
        """
        Reranks a list of documents based on semantic relevance to the query.
        Each document should be a dict containing a 'content' or 'text' key.
        """
        if not self.model or not documents:
            return documents[:top_k]

        # Prepare pairs for cross-encoder: [(query, doc1), (query, doc2), ...]
        pairs = []
        for doc in documents:
            content = doc.get("content", doc.get("text", str(doc)))
            pairs.append((query, content))

        try:
            scores = self.model.predict(pairs)

            # Attach scores to documents
            for i, doc in enumerate(documents):
                doc["rerank_score"] = float(scores[i])

            # Sort by descending score
            ranked_docs = sorted(documents, key=lambda x: x["rerank_score"], reverse=True)
            return ranked_docs[:top_k]

        except Exception as e:
            logger.error(f"Reranking failed: {e}")
            return documents[:top_k]


# Singleton instance for the app
reranker = SemanticReranker()
