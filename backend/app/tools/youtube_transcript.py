"""
YouTube transcript extractor tool.

Strategy (in priority order):
  1. youtube-transcript-api >= 1.0.0 — fetch available transcripts, prefer manual English,
     fall back to auto-generated, fall back to any available language.
     Runs in a thread pool to avoid blocking the async event loop.
  2. httpx + yt-page-data scraping — parses the ytInitialPlayerResponse JSON blob
     embedded in the page using bracket counting (robust against ] in URLs).
  3. Graceful degradation — returns the video title with status="unavailable".
"""

from __future__ import annotations

import asyncio
import html as html_module
import json
import re
from typing import Any

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VIDEO_ID_PATTERNS = [
    r"(?:v=|/)([0-9A-Za-z_-]{11})(?:[&?#]|$)",
    r"youtu\.be/([0-9A-Za-z_-]{11})(?:[?#]|$)",
    r"embed/([0-9A-Za-z_-]{11})(?:[?#]|$)",
    r"shorts/([0-9A-Za-z_-]{11})(?:[?#]|$)",
]

_YT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def extract_video_id(url: str) -> str | None:
    """Return the 11-character YouTube video ID from any valid YouTube URL."""
    for pattern in _VIDEO_ID_PATTERNS:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    if re.fullmatch(r"[0-9A-Za-z_-]{11}", url):
        return url
    return None


def _clean_text(text: str) -> str:
    """Strip HTML tags and normalise whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split())


def _segments_to_text(segments: list) -> str:
    """Join transcript segments / snippet objects into a single clean string."""
    parts: list[str] = []
    for seg in segments:
        raw = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
        cleaned = _clean_text(raw)
        if cleaned:
            parts.append(cleaned)
    return " ".join(parts)


def _extract_json_array(html: str, key: str) -> list | None:
    """
    Robust JSON array extractor using bracket counting.

    Finds `"<key>": [` and counts brackets until the matching `]` is found.
    This correctly handles `]` characters embedded inside baseUrl strings.
    """
    pattern = rf'"{re.escape(key)}"\s*:\s*\['
    m = re.search(pattern, html)
    if not m:
        return None

    start = m.end() - 1  # position of the opening `[`
    depth = 0
    in_string = False
    escape_next = False

    for i in range(start, len(html)):
        ch = html[i]
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                raw = html[start:i + 1]
                # Unescape HTML entities that YouTube embeds (&amp; etc.)
                raw = html_module.unescape(raw)
                try:
                    return list(json.loads(raw))
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(
                        "captionTracks JSON parse failed",
                        error=str(e),
                        snippet=raw[:200],
                    )
                    return None
    return None

def _set_fmt(url: str, fmt: str) -> str:
    """
    Replace or append the `fmt` query parameter in a YouTube timedtext URL.

    YouTube's baseUrl may already contain fmt=srv3 or similar; we replace it
    to force the format we want (json3 is the most reliable for auto-captions).
    """
    if re.search(r"[?&]fmt=", url):
        return re.sub(r"([?&]fmt=)[^&]*", rf"\g<1>{fmt}", url)
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}fmt={fmt}"


def _parse_timedtext_json3(text: str) -> str:
    """
    Parse YouTube's json3 timedtext format into a single plain-text string.

    json3 structure:
      { "events": [ { "segs": [ { "utf8": "caption text" } ] }, ... ] }
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return ""

    parts: list[str] = []
    for event in data.get("events", []):
        for seg in event.get("segs", []):
            raw = seg.get("utf8", "")
            # Skip bare newlines that YouTube uses as line-continuation markers
            cleaned = raw.replace("\n", " ").strip()
            if cleaned:
                parts.append(cleaned)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Strategy 1: youtube-transcript-api 1.x  (sync → thread)
# ---------------------------------------------------------------------------

def _library_fetch_sync(video_id: str) -> dict[str, Any] | None:
    """
    Synchronous inner function — called via asyncio.to_thread so it doesn't
    block the event loop.

    Tries two sub-strategies:
      0. get_transcript() directly — fastest, no listing overhead
      1. list_transcripts() + pick best — handles non-English videos
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
        from youtube_transcript_api._errors import (  # type: ignore
            CouldNotRetrieveTranscript,
            IpBlocked,
            NoTranscriptFound,
            PoTokenRequired,
            RequestBlocked,
            TranscriptsDisabled,
            VideoUnavailable,
            YouTubeDataUnparsable,
            YouTubeRequestFailed,
        )

        _hard_fail = (
            TranscriptsDisabled,
            VideoUnavailable,
            CouldNotRetrieveTranscript,
            IpBlocked,
            RequestBlocked,
            YouTubeRequestFailed,
            YouTubeDataUnparsable,
        )

        # ── Sub-strategy 0: direct get_transcript() ─────────────────────────
        try:
            raw = YouTubeTranscriptApi.get_transcript(
                video_id, languages=["en", "en-US", "en-GB", "a.en"]
            )
            full_text = _segments_to_text(raw)
            if full_text:
                logger.info(
                    "YouTube transcript via get_transcript()",
                    video_id=video_id,
                    segments=len(raw),
                    chars=len(full_text),
                )
                return {
                    "text": full_text,
                    "language": "en",
                    "is_generated": True,
                    "segments": len(raw),
                    "status": "success",
                }
        except NoTranscriptFound:
            logger.info(
                "get_transcript(): no English transcript — trying list_transcripts",
                video_id=video_id,
            )
        except PoTokenRequired as e:
            # YouTube requires a browser token — library can't help, fall through
            # to the httpx timedtext scrape which bypasses the API entirely.
            logger.warning(
                "get_transcript(): PoTokenRequired — falling through to timedtext scrape",
                video_id=video_id,
                error=str(e),
            )
            return None  # signal caller: skip remaining library sub-strategies
        except _hard_fail as e:
            logger.warning(
                "get_transcript() returned hard failure",
                video_id=video_id,
                error_type=type(e).__name__,
                error=str(e),
            )
            return None

        # ── Sub-strategy 1: list all transcripts, pick best ─────────────────
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        except _hard_fail as e:
            logger.warning(
                "list_transcripts() hard failure",
                video_id=video_id,
                error_type=type(e).__name__,
                error=str(e),
            )
            return None

        transcript = None

        # Priority 1: manual English
        try:
            transcript = transcript_list.find_manually_created_transcript(
                ["en", "en-US", "en-GB"]
            )
        except NoTranscriptFound:
            pass

        # Priority 2: auto-generated English
        if transcript is None:
            try:
                transcript = transcript_list.find_generated_transcript(
                    ["en", "en-US", "en-GB"]
                )
            except NoTranscriptFound:
                pass

        # Priority 3: any available language
        if transcript is None:
            for t in transcript_list:
                transcript = t
                break

        if transcript is None:
            logger.warning("No transcript in any language", video_id=video_id)
            return None

        fetched = transcript.fetch()
        segments = list(fetched)
        full_text = _segments_to_text(segments)

        if not full_text:
            logger.warning(
                "list_transcripts() returned empty text",
                video_id=video_id,
                language=transcript.language_code,
                segments=len(segments),
            )
            return None

        logger.info(
            "YouTube transcript via list_transcripts()",
            video_id=video_id,
            language=transcript.language_code,
            segments=len(segments),
            chars=len(full_text),
        )
        return {
            "text": full_text,
            "language": transcript.language_code,
            "is_generated": transcript.is_generated,
            "segments": len(segments),
            "status": "success",
        }

    except ImportError:
        logger.warning("youtube-transcript-api not installed — skipping library strategy")
        return None
    except Exception as e:
        logger.warning(
            "youtube-transcript-api unexpected error",
            video_id=video_id,
            error_type=type(e).__name__,
            error=str(e),
        )
        return None



async def _fetch_via_library(video_id: str) -> dict[str, Any] | None:
    """Async wrapper — runs the sync library call in a thread pool."""
    return await asyncio.to_thread(_library_fetch_sync, video_id)


# ---------------------------------------------------------------------------
# Strategy 2: httpx — scrape the YouTube watch page for captionTracks
# ---------------------------------------------------------------------------

def _pick_best_track(tracks: list[dict]) -> dict | None:
    """
    Select the best caption track:
      manual English > auto-generated English > any English > any
    """
    if not tracks:
        return None

    def priority(t: dict) -> int:
        lang = t.get("languageCode", "")
        kind = t.get("kind", "")
        if lang.startswith("en") and kind != "asr":
            return 0
        if lang.startswith("en"):
            return 1
        if kind != "asr":
            return 2
        return 3

    return min(tracks, key=priority)


async def _fetch_via_timedtext(video_id: str) -> dict[str, Any] | None:
    """
    Scrape the YouTube watch page, extract captionTracks using bracket counting,
    then fetch the raw timedtext XML.
    """
    try:
        async with httpx.AsyncClient(
            headers=_YT_HEADERS, timeout=20.0, follow_redirects=True
        ) as client:
            resp = await client.get(f"https://www.youtube.com/watch?v={video_id}")

            if resp.status_code != 200:
                logger.warning(
                    "YT page fetch failed",
                    video_id=video_id,
                    status=resp.status_code,
                )
                return None

            page_html = resp.text
            has_caption_key = "captionTracks" in page_html
            logger.info(
                "YT page fetched",
                video_id=video_id,
                page_bytes=len(page_html),
                has_captionTracks_key=has_caption_key,
            )

            if not has_caption_key:
                logger.warning(
                    "captionTracks key not present anywhere in page HTML — "
                    "video may have no captions, or YouTube returned a consent/bot-check page",
                    video_id=video_id,
                    page_snippet=page_html[:300],
                )
                return None

            # Extract captionTracks using robust bracket-counting JSON parser
            caption_tracks = _extract_json_array(page_html, "captionTracks")

            if not caption_tracks:
                logger.warning(
                    "captionTracks not found in page — video may lack captions",
                    video_id=video_id,
                )
                return None

            logger.info(
                "captionTracks found",
                video_id=video_id,
                count=len(caption_tracks),
                languages=[t.get("languageCode") for t in caption_tracks],
            )

            chosen = _pick_best_track(caption_tracks)
            if not chosen:
                return None

            base_url: str = chosen.get("baseUrl", "")
            if not base_url:
                logger.warning(
                    "Chosen track has no baseUrl",
                    video_id=video_id,
                    track=chosen,
                )
                return None

            # Unescape \uXXXX sequences safely (avoid crashing on non-ASCII)
            base_url = re.sub(
                r"\\u([0-9a-fA-F]{4})",
                lambda m: chr(int(m.group(1), 16)),
                base_url,
            )

            # ── Timedtext requests must include Referer so YouTube serves content ──
            timedtext_headers = {
                **_YT_HEADERS,
                "Referer": f"https://www.youtube.com/watch?v={video_id}",
                "Origin": "https://www.youtube.com",
            }

            # ── Try fmt=json3 first (most reliable for auto-generated captions) ──
            json3_url = _set_fmt(base_url, "json3")
            logger.info(
                "Fetching timedtext json3",
                video_id=video_id,
                language=chosen.get("languageCode"),
                url_prefix=json3_url[:80],
            )

            json3_resp = await client.get(json3_url, headers=timedtext_headers)
            if json3_resp.status_code == 200 and json3_resp.text.strip():
                full_text = _parse_timedtext_json3(json3_resp.text)
                if full_text:
                    lang_code = chosen.get("languageCode", "und")
                    logger.info(
                        "YouTube transcript via timedtext json3",
                        video_id=video_id,
                        language=lang_code,
                        chars=len(full_text),
                    )
                    return {
                        "text": full_text,
                        "language": lang_code,
                        "is_generated": chosen.get("kind") == "asr",
                        "segments": full_text.count(" "),
                        "status": "success_scraped",
                    }

            # ── Fallback: raw XML / srv1 ─────────────────────────────────────
            xml_url = _set_fmt(base_url, "srv1")
            xml_resp = await client.get(xml_url, headers=timedtext_headers)
            if xml_resp.status_code != 200:
                logger.warning(
                    "Timedtext xml fetch failed",
                    video_id=video_id,
                    status=xml_resp.status_code,
                )
                return None

            raw_texts = re.findall(r"<text[^>]*>(.*?)</text>", xml_resp.text, re.DOTALL)
            cleaned = [_clean_text(html_module.unescape(t)) for t in raw_texts]
            full_text = " ".join(p for p in cleaned if p)

            if not full_text:
                logger.warning(
                    "Timedtext XML also yielded empty text",
                    video_id=video_id,
                    raw_count=len(raw_texts),
                )
                return None

            lang_code = chosen.get("languageCode", "und")
            logger.info(
                "YouTube transcript via timedtext scrape",
                video_id=video_id,
                language=lang_code,
                segments=len(raw_texts),
                chars=len(full_text),
            )
            return {
                "text": full_text,
                "language": lang_code,
                "is_generated": chosen.get("kind") == "asr",
                "segments": len(raw_texts),
                "status": "success_scraped",
            }

    except Exception as e:
        logger.warning(
            "Timedtext scrape strategy failed",
            video_id=video_id,
            error_type=type(e).__name__,
            error=str(e),
        )
        return None


# ---------------------------------------------------------------------------
# Strategy 3: yt-dlp — handles YouTube anti-bot measures natively
# ---------------------------------------------------------------------------

def _ytdlp_get_subtitle_info_sync(video_id: str) -> dict[str, Any] | None:
    """
    Use yt-dlp to extract subtitle/caption URLs without downloading the video.
    Returns {'url': ..., 'ext': ..., 'language': ..., 'is_generated': ...} or None.
    Runs synchronously — call via asyncio.to_thread.
    """
    try:
        import yt_dlp  # type: ignore

        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "extract_flat": False,
        }

        # pyrefly: ignore [bad-argument-type]
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}",
                download=False,
            )

        manual_subs: dict = info.get("subtitles") or {}
        auto_subs: dict = info.get("automatic_captions") or {}

        def _pick_sub(subs: dict, is_generated: bool) -> dict | None:
            for lang_code in ["en", "en-US", "en-GB"]:
                formats = subs.get(lang_code, [])
                for preferred_ext in ("json3", "vtt", "srv3", "srv1"):
                    for fmt in formats:
                        if fmt.get("ext") == preferred_ext and fmt.get("url"):
                            return {
                                "url": fmt["url"],
                                "ext": preferred_ext,
                                "language": lang_code,
                                "is_generated": is_generated,
                            }
            return None

        result = _pick_sub(manual_subs, is_generated=False) or _pick_sub(auto_subs, is_generated=True)

        if result:
            logger.info(
                "yt-dlp found subtitle URL",
                video_id=video_id,
                language=result["language"],
                ext=result["ext"],
                is_generated=result["is_generated"],
            )
        else:
            logger.warning("yt-dlp found no subtitle formats", video_id=video_id)

        return result

    except ImportError:
        logger.warning("yt-dlp not installed — skipping")
        return None
    except Exception as e:
        logger.warning(
            "yt-dlp strategy failed",
            video_id=video_id,
            error_type=type(e).__name__,
            error=str(e),
        )
        return None


async def _fetch_via_ytdlp(video_id: str) -> dict[str, Any] | None:
    """Async wrapper for the yt-dlp subtitle extraction + httpx download."""
    sub_info = await asyncio.to_thread(_ytdlp_get_subtitle_info_sync, video_id)
    if not sub_info:
        return None

    try:
        async with httpx.AsyncClient(
            headers=_YT_HEADERS, timeout=20.0, follow_redirects=True
        ) as client:
            resp = await client.get(sub_info["url"])
            if resp.status_code != 200 or not resp.text.strip():
                logger.warning(
                    "yt-dlp subtitle URL fetch failed",
                    video_id=video_id,
                    status=resp.status_code,
                )
                return None

            ext = sub_info["ext"]
            if ext == "json3":
                full_text = _parse_timedtext_json3(resp.text)
            elif ext in ("vtt",):
                # Strip VTT header and timestamp lines
                lines = [
                    ln.strip()
                    for ln in resp.text.splitlines()
                    if ln.strip()
                    and not ln.startswith("WEBVTT")
                    and not re.match(r"^\d{2}:\d{2}", ln)
                    and not re.match(r"^NOTE", ln)
                    and ln.strip() != ""
                ]
                full_text = " ".join(lines)
            else:
                # srv1 / srv3 XML
                raw_texts = re.findall(r"<text[^>]*>(.*?)</text>", resp.text, re.DOTALL)
                full_text = " ".join(
                    _clean_text(html_module.unescape(t)) for t in raw_texts if t.strip()
                )

            if not full_text:
                return None

            logger.info(
                "YouTube transcript via yt-dlp",
                video_id=video_id,
                language=sub_info["language"],
                chars=len(full_text),
            )
            return {
                "text": full_text,
                "language": sub_info["language"],
                "is_generated": sub_info["is_generated"],
                "segments": full_text.count(" "),
                "status": "success_ytdlp",
            }
    except Exception as e:
        logger.warning(
            "yt-dlp subtitle download failed",
            video_id=video_id,
            error_type=type(e).__name__,
            error=str(e),
        )
        return None


# ---------------------------------------------------------------------------

async def _get_video_title(video_id: str) -> str:
    try:
        async with httpx.AsyncClient(
            headers=_YT_HEADERS, timeout=10.0, follow_redirects=True
        ) as client:
            resp = await client.get(f"https://www.youtube.com/watch?v={video_id}")
            if resp.status_code == 200:
                m = re.search(r"<title>([^<]+)</title>", resp.text)
                if m:
                    title = m.group(1).replace(" - YouTube", "").strip()
                    return title or f"YouTube Video ({video_id})"
    except Exception:
        pass
    return f"YouTube Video ({video_id})"


# ---------------------------------------------------------------------------
# Main tool class
# ---------------------------------------------------------------------------

class YouTubeTranscriptTool:
    name = "youtube_transcript"
    description = "Extracts the full transcript text and metadata from a YouTube video URL."

    @staticmethod
    def extract_video_id(url: str) -> str | None:
        return extract_video_id(url)

    async def get_transcript(self, url: str) -> dict[str, Any]:
        """
        Extract transcript for a YouTube video using a multi-strategy approach.

        Returns a dict with:
            video_id, url, title, text, language, is_generated, segments, status
        """
        video_id = extract_video_id(url)
        if not video_id:
            return {
                "error": "Invalid YouTube URL — could not extract video ID",
                "text": "",
                "title": "YouTube Video",
                "status": "error",
            }

        logger.info("Extracting YouTube transcript", video_id=video_id, url=url)

        # Fetch title and library transcript concurrently
        title_task = asyncio.create_task(_get_video_title(video_id))
        library_task = asyncio.create_task(_fetch_via_library(video_id))

        result = await library_task

        if result and result.get("text"):
            logger.info("Library strategy succeeded", video_id=video_id)
        else:
            logger.info(
                "Library strategy failed — trying timedtext scrape",
                video_id=video_id,
            )
            result = await _fetch_via_timedtext(video_id)

        if not (result and result.get("text")):
            logger.info(
                "Timedtext scrape failed — trying yt-dlp",
                video_id=video_id,
            )
            result = await _fetch_via_ytdlp(video_id)

        title = await title_task

        if result and result.get("text"):
            return {
                "video_id": video_id,
                "url": url,
                "title": title,
                "text": result["text"],
                "language": result.get("language", "en"),
                "is_generated": result.get("is_generated", True),
                "segments": result.get("segments", 0),
                "status": result.get("status", "success"),
            }

        # All strategies failed
        logger.error(
            "All YouTube transcript strategies failed",
            video_id=video_id,
            url=url,
        )
        return {
            "video_id": video_id,
            "url": url,
            "title": title,
            "text": (
                f"YouTube video: {title}. "
                f"Transcript could not be extracted automatically. "
                f"Video ID: {video_id}. URL: {url}"
            ),
            "language": "unknown",
            "is_generated": False,
            "segments": 0,
            "status": "unavailable",
        }

    async def execute(self, **kwargs: Any) -> dict[str, Any]:
        url = kwargs.get("url", "")
        return await self.get_transcript(url=url)
