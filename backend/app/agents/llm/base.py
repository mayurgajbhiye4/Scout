from abc import ABC, abstractmethod
from typing import Any


class LLMProvider(ABC):
    """Base interface for all LLM providers (e.g., Gemini)."""

    @abstractmethod
    async def generate(self, prompt: str, system_instruction: str | None = None, response_schema: Any | None = None, temperature: float = 0.0) -> str:
        """
        Generate a text response.
        If response_schema is provided, the output must be a JSON string conforming to it.
        """
        pass
