"""
GitHub repository extractor.

Uses the GitHub REST Git Trees API (single request for the full file tree) to
discover all files, then fetches each text file via the Contents API.

Supported URL formats:
  • https://github.com/owner/repo
  • https://github.com/owner/repo/tree/branch
  • https://github.com/owner/repo/blob/branch/path/to/file   (single file)

Rate-limits / best practices:
  • Uses authenticated requests when GITHUB_TOKEN is set in settings (5 000 req/hr).
  • Without a token only 60 req/hr are available — large repos may not fully ingest.
  • Skips binary files (images, archives, compiled objects, etc.).
  • Skips files larger than MAX_FILE_BYTES (default 300 KB each).
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
MAX_FILES = 300
MAX_FILE_BYTES = 300_000
REQUEST_TIMEOUT = 30.0

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
        ".sql", ".graphql", ".proto", ".vue", ".svelte",
    }
)

_TEXT_BASENAMES: frozenset[str] = frozenset(
    {
        "dockerfile", "makefile", "gemfile", "procfile", "rakefile",
        ".gitignore", ".gitattributes", ".editorconfig", "license",
        "readme", "contributing", "changelog",
    }
)

_SKIP_DIRS: frozenset[str] = frozenset(
    {
        ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
        "dist", "build", ".next", ".nuxt", "vendor", "third_party",
        ".github", ".idea", ".vscode",
    }
)


def _parse_github_url(url: str) -> tuple[str, str, str, str | None]:
    """
    Returns (owner, repo, ref, subpath).
    ref defaults to 'HEAD'; subpath is None for whole-repo ingestion.
    """
    url = url.rstrip("/")
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


def _is_text_file(path: str, size: int) -> bool:
    """Return True if the file looks like text and is within our size limit."""
    if size > MAX_FILE_BYTES:
        return False
    basename = path.rsplit("/", 1)[-1].lower()
    ext = ("." + basename.rsplit(".", 1)[-1]) if "." in basename else ""
    name_no_ext = basename.rsplit(".", 1)[0]
    return ext in _TEXT_EXTENSIONS or name_no_ext in _TEXT_BASENAMES or basename in _TEXT_BASENAMES


def _is_skipped_path(path: str) -> bool:
    """Return True if any component of the path is in the skip list."""
    parts = path.split("/")
    return any(p in _SKIP_DIRS for p in parts)


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
            logger.info("GitHub extractor using authenticated requests")
        else:
            logger.warning(
                "GitHub extractor running WITHOUT a token — rate-limited to 60 req/hr. "
                "Set GITHUB_TOKEN in .env for best results."
            )

    # ── Public ───────────────────────────────────────────────────────────────

    async def extract(self, url: str) -> dict[str, Any]:
        """
        Fetch all text files from *url* and return:
        {
          "text": "<concatenated content>",
          "metadata": { "repo": "...", "ref": "...", "files_fetched": N, ... }
        }
        """
        try:
            owner, repo, ref, subpath = _parse_github_url(url)
        except ValueError as exc:
            logger.error("Bad GitHub URL", url=url, error=str(exc))
            return {"text": "", "metadata": {"error": str(exc), "files_fetched": 0}}

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
            # ── Step 1: Resolve the default branch ref when ref == "HEAD" ──
            resolved_ref = await self._resolve_ref(client, owner, repo, ref)

            # ── Step 2: Fetch the full file tree in one API call ───────────
            tree = await self._get_tree(client, owner, repo, resolved_ref)

            if tree is None:
                # Error already logged with details
                return {
                    "text": (
                        f"GitHub repository {owner}/{repo} — could not fetch file tree. "
                        "Check that the repository is public or GITHUB_TOKEN is set in .env."
                    ),
                    "metadata": {
                        "repo": f"{owner}/{repo}",
                        "ref": resolved_ref,
                        "files_fetched": 0,
                        "error": "tree_fetch_failed",
                    },
                }

            # ── Step 3: Filter to text blobs ───────────────────────────────
            candidates = [
                item for item in tree
                if item.get("type") == "blob"
                and not _is_skipped_path(item.get("path", ""))
                and _is_text_file(item.get("path", ""), item.get("size", 0))
            ]

            if subpath:
                candidates = [
                    c for c in candidates
                    if c.get("path", "").startswith(subpath)
                ]

            candidates = candidates[:MAX_FILES]

            logger.info(
                "File tree filtered",
                total_blobs=len(tree),
                text_candidates=len(candidates),
            )

            # ── Step 4: Fetch file contents ────────────────────────────────
            files: list[tuple[str, str]] = []
            for item in candidates:
                content = await self._fetch_blob(client, owner, repo, item)
                if content:
                    files.append((item["path"], content))

        if not files:
            logger.warning("No text files could be fetched", repo=f"{owner}/{repo}")
            return {
                "text": (
                    f"GitHub repository {owner}/{repo} — no text files could be fetched. "
                    "The repo may be empty, private, or all files exceeded the size limit."
                ),
                "metadata": {
                    "repo": f"{owner}/{repo}",
                    "ref": resolved_ref,
                    "files_fetched": 0,
                },
            }

        # ── Step 5: Assemble text blob ─────────────────────────────────────
        parts: list[str] = [f"### FILE: {path}\n\n{content}" for path, content in files]
        full_text = "\n\n---\n\n".join(parts)

        metadata: dict[str, Any] = {
            "repo": f"{owner}/{repo}",
            "url": url,
            "ref": resolved_ref,
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

    # ── Internal helpers ─────────────────────────────────────────────────────

    async def _resolve_ref(
        self, client: httpx.AsyncClient, owner: str, repo: str, ref: str
    ) -> str:
        """Resolve 'HEAD' to the actual default branch name (e.g. 'main')."""
        if ref != "HEAD":
            return ref
        try:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
            )
            if resp.status_code == 200:
                return resp.json().get("default_branch", "main")
            else:
                logger.warning(
                    "Could not resolve default branch",
                    status=resp.status_code,
                    body=resp.text[:300],
                )
        except httpx.HTTPError as exc:
            logger.warning("HTTP error resolving ref", error=str(exc))
        return "main"

    async def _get_tree(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        ref: str,
    ) -> list[dict[str, Any]] | None:
        """
        Fetch the full recursive git tree for *ref*.
        Returns None on error (error is logged with response body).
        """
        url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}"
        try:
            resp = await client.get(url, params={"recursive": "1"})
        except httpx.HTTPError as exc:
            logger.error("HTTP error fetching git tree", error=str(exc))
            return None

        if resp.status_code == 401:
            logger.error(
                "GitHub API: Unauthorized (401) — set GITHUB_TOKEN in .env",
                body=resp.text[:400],
            )
            return None
        if resp.status_code == 403:
            logger.error(
                "GitHub API: Forbidden (403) — rate-limited or missing token",
                body=resp.text[:400],
                reset_header=resp.headers.get("X-RateLimit-Reset"),
            )
            return None
        if resp.status_code == 404:
            logger.error(
                "GitHub API: Repo or ref not found (404) — check URL and visibility",
                owner=owner,
                repo=repo,
                ref=ref,
            )
            return None
        if resp.status_code != 200:
            logger.error(
                "GitHub API: Unexpected status fetching tree",
                status=resp.status_code,
                body=resp.text[:400],
            )
            return None

        data = resp.json()
        tree: list[dict[str, Any]] = data.get("tree", [])

        if data.get("truncated"):
            logger.warning(
                "GitHub git tree was truncated (>100k files) — only partial ingestion",
                repo=f"{owner}/{repo}",
            )

        return tree

    async def _fetch_blob(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        item: dict[str, Any],
    ) -> str | None:
        """
        Fetch a single blob's text content.
        Uses the Contents API which returns base64-encoded content inline.
        """
        path: str = item.get("path", "")
        sha: str = item.get("sha", "")

        # Use the blobs API (sha-based) to avoid another ref lookup
        blob_url = f"https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}"
        try:
            resp = await client.get(
                blob_url,
                headers={**self._headers, "Accept": "application/vnd.github.v3+json"},
            )
        except httpx.HTTPError as exc:
            logger.debug("HTTP error fetching blob", path=path, error=str(exc))
            return None

        if resp.status_code != 200:
            logger.debug("Blob fetch failed", path=path, status=resp.status_code)
            return None

        data = resp.json()
        encoding = data.get("encoding", "")
        raw_content: str = data.get("content", "")

        if encoding == "base64":
            try:
                text = base64.b64decode(raw_content).decode("utf-8", errors="replace")
            except Exception:
                return None
        else:
            text = raw_content

        # Strip null bytes — PostgreSQL TEXT columns reject \x00 entirely
        text = text.replace("\x00", "").strip()
        return text if text else None
