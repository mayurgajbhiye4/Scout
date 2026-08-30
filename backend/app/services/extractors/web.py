import httpx
from bs4 import BeautifulSoup
from .base import BaseExtractor


class WebExtractor(BaseExtractor):
    """Extract text from web pages."""

    async def extract(self, source: str) -> dict:
        """Source here is a URL string."""
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            response = await client.get(source)
            response.raise_for_status()
            html = response.text

        soup = BeautifulSoup(html, "html.parser")
        
        # Remove script, style, and nav elements
        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()

        title = soup.title.string if soup.title else ""
        text = soup.get_text(separator="\n", strip=True)

        return {
            "text": text,
            "metadata": {
                "title": title.strip() if title else "",
                "url": source,
                "extractor": "WebExtractor",
            }
        }
