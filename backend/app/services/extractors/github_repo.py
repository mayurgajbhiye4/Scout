"""
GitHub repository extractor.

Uses the GitHub REST Contents API to recursively walk the file tree of a
repository and fetch every text-based file.  The result is a single text blob
suitable for chunking + embedding, together with rich metadata.

Supported URL formats:
  • https://github.com/owner/repo
  • https://github.com/owner/repo/tree/branch
  • https://github.com/owner/repo/blob/branch/path/to/file   (single file)

Rate-limits / best practices:
  • Uses authenticated requests when GITHUB_TOKEN is set in settings.
  • Skips binary files (images, archives, compiled objects, etc.).
  • Skips files larger than MAX_FILE_BYTES (default 500 KB each).
  • Caps the total number of files fetched at MAX_FILES (default 300).
"""

from __future__ import annotations

import base64
import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Tunables ────────────────────────────────────────────────────────────────
MAX_FILES = 300          # max files to ingest from a single repo
MAX_FILE_BYTES = 500_000  # skip individual files larger than this
REQUEST_TIMEOUT = 20.0

# Extensions considered text / source code
_TEXT_EXTENSIONS: frozenset[str] = frozenset(
    {
        # code
        ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".kt",
        ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift", ".scala",
        ".clj", ".ex", ".exs", ".hs", ".lua", ".r", ".m", ".sh", ".bash",
        ".zsh", ".fish", ".ps1", ".bat", ".cmd",
        # config / data
        ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env",
        ".xml", ".csv", ".tsv",
        # docs
        ".md", ".mdx", ".rst", ".txt", ".tex",
        # web
        ".html", ".htm", ".css", ".scss", ".sass", ".less",
        # misc
        ".sql", ".graphql", ".proto", ".dockerfile", ".makefile",
    }
)

_SKIP_DIRS: frozenset[str] = frozenset(
    {
        ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
        "dist", "build", ".next", ".nuxt", "vendor", "third_party",
        "testdata", "fixtures", "mocks", ".github",
    }
)


def _parse_github_url(url: str) -> tuple[str, str, str, str | None]:
    """
    Returns (owner, repo, ref, subpath).
    ref defaults to 'HEAD'; subpath is None for whole-repo ingestion.
    """
    url = url.rstrip("/")
    # strip protocol
    url = re.sub(r"^https?://github\.com/", "", url)

    parts = url.split("/")
    if len(parts) < 2:
        raise ValueError(f"Cannot parse GitHub URL: {url!r}")

    owner, repo = parts[0], parts[1]
    repo = repo.removesuffix(".git")

    ref = "HEAD"
    subpath: str | None = None

    if len(parts) >= 4 and parts[2] in ("tree", "blob"):
        ref = parts[3]
        if len(parts) >= 5:
            subpath = "/".join(parts[4:])

    return owner, repo, ref, subpath


class GitHubRepoExtractor:
    """Fetch and extract text content from an entire GitHub repository."""

    def __init__(self) -> None:
        token = getattr(settings, "GITHUB_TOKEN", None)
        self._headers: dict[str, str] = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "AIResearchWorkspace/1.0",
        }
        if token:
            self._headers["Authorization"] = f"Bearer {token}"

    # ── Public ───────────────────────────────────────────────────────────────

    async def extract(self, url: str) -> dict[str, Any]:
        """
        Fetch all text files from *url* and return:
        {
          "text": "<concatenated content>",
          "metadata": { "repo": "...", "files_fetched": N, ... }
        }
        """
        try:
            owner, repo, ref, subpath = _parse_github_url(url)
        except ValueError as exc:
            logger.error("Bad GitHub URL", url=url, error=str(exc))
            return {"text": "", "metadata": {"error": str(exc)}}

        logger.info(
            "Fetching GitHub repo",
            owner=owner,
            repo=repo,
            ref=ref,
            subpath=subpath,
        )

        async with httpx.AsyncClient(
            headers=self._headers, timeout=REQUEST_TIMEOUT, follow_redirects=True
        ) as client:
            if subpath:
                # Single file / subtree
                files = await self._fetch_tree(client, owner, repo, ref, subpath)
            else:
                files = await self._fetch_tree(client, owner, repo, ref, "")

        if not files:
            logger.warning("No files fetched from repo", url=url)
            return {
                "text": f"GitHub repository {owner}/{repo} — no text files could be fetched.",
                "metadata": {"repo": f"{owner}/{repo}", "files_fetched": 0},
            }

        # Build a single text blob: each file gets a header + content
        parts: list[str] = []
        for path, content in files:
            parts.append(f"### FILE: {path}\n\n{content}\n")

        full_text = "\n---\n".join(parts)

        metadata = {
            "repo": f"{owner}/{repo}",
            "url": url,
            "ref": ref,
            "files_fetched": len(files),
            "total_chars": len(full_text),
            "extractor": "GitHubRepoExtractor",
        }

        logger.info(
            "GitHub repo extraction complete",
            repo=f"{owner}/{repo}",
            files=len(files),
            chars=len(full_text),
        )

        return {"text": full_text, "metadata": metadata}

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _fetch_tree(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        ref: str,
        path: str,
    ) -> list[tuple[str, str]]:
        """
        Recursively walk the directory tree starting at *path* and return a
        list of (relative_path, decoded_text_content) tuples.
        """
        results: list[tuple[str, str]] = []
        await self._walk(client, owner, repo, ref, path, results)
        return results

    async def _walk(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        ref: str,
        path: str,
        results: list[tuple[str, str]],
    ) -> None:
        if len(results) >= MAX_FILES:
            return

        contents_url = (
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
        )
        params = {"ref": ref} if ref != "HEAD" else {}

        try:
            resp = await client.get(contents_url, params=params)
        except httpx.HTTPError as exc:
            logger.warning("HTTP error fetching path", path=path, error=str(exc))
            return

        if resp.status_code == 404:
            logger.warning("Path not found in repo", path=path)
            return
        if resp.status_code != 200:
            logger.warning(
                "Unexpected status from GitHub API",
                path=path,
                status=resp.status_code,
            )
            return

        data = resp.json()

        # Single file
        if isinstance(data, dict) and data.get("type") == "file":
            await self._fetch_file(data, results)
            return

        # Directory listing
        if isinstance(data, list):
            for item in data:
                if len(results) >= MAX_FILES:
                    break

                item_type = item.get("type")
                item_path = item.get("path", "")
                item_name = item.get("name", "")

                if item_type == "dir":
                    if item_name in _SKIP_DIRS:
                        continue
                    await self._walk(client, owner, repo, ref, item_path, results)

                elif item_type == "file":
                    await self._fetch_file(item, results)

    async def _fetch_file(
        self,
        item: dict[str, Any],
        results: list[tuple[str, str]],
    ) -> None:
        """Decode and append a single file's content if it is text-based."""
        path: str = item.get("path", "")
        size: int = item.get("size", 0)

        # Skip by size
        if size > MAX_FILE_BYTES:
            logger.debug("Skipping large file", path=path, size=size)
            return

        # Skip by extension
        ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
        # Special case: Dockerfile, Makefile, etc.
        basename = path.rsplit("/", 1)[-1].lower()
        if ext not in _TEXT_EXTENSIONS and basename not in {
            "dockerfile", "makefile", "gemfile", "procfile", "rakefile",
        }:
            logger.debug("Skipping non-text file", path=path, ext=ext)
            return

        # GitHub may provide content inline (base64) or via download_url
        content_b64: str | None = item.get("content")
        if content_b64:
            try:
                text = base64.b64decode(content_b64).decode("utf-8", errors="replace")
            except Exception:
                return
        else:
            download_url: str | None = item.get("download_url")
            if not download_url:
                return
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as dl_client:
                    dl_resp = await dl_client.get(download_url)
                    if dl_resp.status_code != 200:
                        return
                    text = dl_resp.text
            except httpx.HTTPError:
                return

        text = text.strip()
        if not text:
            return

        results.append((path, text))
        logger.debug("Fetched file", path=path, chars=len(text))
