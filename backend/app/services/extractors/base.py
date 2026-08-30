from abc import ABC, abstractmethod


class BaseExtractor(ABC):
    """Base class for all document and URL extractors."""

    @abstractmethod
    async def extract(self, source: str | bytes) -> dict:
        """
        Extract text and metadata from a source.
        
        Returns:
            dict: {
                "text": str,
                "metadata": dict
            }
        """
        pass
