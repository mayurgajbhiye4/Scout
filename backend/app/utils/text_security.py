"""
Security and text utilities for prompt injection defense, SSRF validation, and token estimation.
"""

import asyncio
import ipaddress
import re
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTNAMES = (
    "localhost",
    "127.0.0.1",
    "0.0.0.0",  # noqa: S104 - blocked host name, not a bind address
    "::1",
    "metadata.google.internal",
)


class UnsafeURLError(ValueError):
    """The URL isn't http(s), or it points at a private, internal or otherwise non-public address."""


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # ::ffff:127.0.0.1 is 127.0.0.1
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    # is_global also excludes shared (100.64/10), documentation and benchmarking ranges
    return ip.is_global and not ip.is_multicast


def estimate_tokens(text: str) -> int:
    """Rough token estimation (~4 characters per token for English)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def sanitize_untrusted_text(text: str, max_chars: int = 25000) -> str:
    """
    Sanitize untrusted external text from PDFs or web scrapers:
    - Strips control characters
    - Caps maximum length
    - Neutralizes common prompt injection attack delimiters
    """
    if not text:
        return ""

    # Strip non-printable ASCII control characters except newlines/tabs
    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", text)

    # Neutralize instruction injection headers
    suspicious_patterns = [
        r"(?i)ignore\s+(all\s+)?previous\s+instructions",
        r"(?i)system\s+prompt\s*:",
        r"(?i)you\s+are\s+now\s+in\s+developer\s+mode",
    ]
    for pattern in suspicious_patterns:
        cleaned = re.sub(pattern, "[Filtered external instruction]", cleaned)

    return cleaned[:max_chars].strip()


def validate_url_safety(url: str) -> bool:
    """
    SSRF safeguard: Validates that the URL uses HTTP/HTTPS and does not target
    private, internal, or loopback IP ranges.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        hostname = hostname.lower().rstrip(".")
        if hostname in _BLOCKED_HOSTNAMES or hostname.endswith(".localhost"):
            return False

        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            return True  # a domain name; ensure_public_url checks what it resolves to
        return _is_public_ip(ip)
    except Exception:
        return False


async def _resolve_host(host: str, port: int) -> list[str]:
    """Every address the host resolves to. Separate so tests can stub DNS."""
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


async def ensure_public_url(url: str) -> None:
    """
    SSRF guard to run before every server-side fetch of a user-supplied URL, redirects included.
    Raises UnsafeURLError when the URL, or any address its host resolves to, isn't public.

    A host that doesn't resolve passes: the fetch fails on its own. DNS can still change between
    this check and the fetch (rebinding); pinning the resolved address would close that gap.
    """
    message = "This URL points to a private or internal address, so it can't be added."
    if not validate_url_safety(url):
        raise UnsafeURLError(message)
    parsed = urlparse(url)
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise UnsafeURLError("This URL isn't valid.") from exc
    try:
        addresses = await _resolve_host(parsed.hostname or "", port)
    except (socket.gaierror, UnicodeError):
        return
    for address in addresses:
        # Drop an IPv6 zone id ("fe80::1%eth0")
        if not _is_public_ip(ipaddress.ip_address(address.split("%")[0])):
            raise UnsafeURLError(message)
