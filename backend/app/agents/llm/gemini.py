import json
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.config import settings
from app.core.logging import get_logger
from .base import LLMProvider

logger = get_logger(__name__)


class GeminiProvider(LLMProvider):
    """Google Gemini implementation using the new google-genai SDK."""

    def __init__(self):
        # We rely on settings.GEMINI_API_KEY being present
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model = settings.LLM_MODEL

    async def generate(self, prompt: str, system_instruction: str | None = None, response_schema: Any | None = None, temperature: float = 0.0) -> str:
        
        # Configure GenerationConfig
        config_kwargs = {
            "temperature": temperature,
        }
        
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
            
        if response_schema:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = response_schema
            
        config = types.GenerateContentConfig(**config_kwargs)

        try:
            # We use the sync client for simplicity in the async wrapper for now
            # Ideally the genai SDK has native async methods (`client.aio.models.generate_content`)
            # Wait, the new SDK does have aio support: client.aio.models.generate_content
            # Let's use it for better concurrency
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config
            )
            
            return response.text
            
        except APIError as e:
            logger.error("Gemini API Error", error=str(e))
            raise
        except Exception as e:
            logger.error("Unexpected error calling Gemini", error=str(e))
            raise
