from bs4 import BeautifulSoup

from .base import BaseExtractor
from .fetch import fetch_url


class WebExtractor(BaseExtractor):
    """Extract text from web pages."""

    async def extract(self, source: str) -> dict:
        """Source here is a URL string."""
        fetched = await fetch_url(source)
        return self.parse(fetched.body, url=source, charset=fetched.charset)

    @staticmethod
    def parse(body: bytes, url: str, charset: str | None = None) -> dict:
        """Parses an already-downloaded HTML (or plain text) body."""
        # Given bytes, BeautifulSoup also honours a <meta charset> when the header names none
        soup = BeautifulSoup(body, "html.parser", from_encoding=charset)

        # Remove script, style, and nav elements
        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()

        title = soup.title.string if soup.title else ""
        text = soup.get_text(separator="\n", strip=True)

        return {
            "text": text,
            "metadata": {
                "title": title.strip() if title else "",
                "url": url,
                "extractor": "WebExtractor",
            },
        }
