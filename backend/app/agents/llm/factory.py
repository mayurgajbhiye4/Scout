from .base import LLMProvider
from .gemini import GeminiProvider

_instance = None

def get_llm() -> LLMProvider:
    """Factory function to get the configured LLM provider."""
    global _instance
    if _instance is None:
        _instance = GeminiProvider()
    return _instance
