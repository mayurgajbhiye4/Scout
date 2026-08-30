import charset_normalizer
from .base import BaseExtractor


class PlainTextExtractor(BaseExtractor):
    """Extract text from plain text files and Markdown."""

    async def extract(self, source: str | bytes) -> dict:
        if isinstance(source, str):
            text = source
        else:
            # Safely decode bytes guessing the charset
            match = charset_normalizer.from_bytes(source).best()
            text = str(match) if match else source.decode("utf-8", errors="replace")

        return {
            "text": text.strip(),
            "metadata": {
                "length": len(text),
                "extractor": "PlainTextExtractor",
            }
        }
