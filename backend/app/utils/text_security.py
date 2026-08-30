"""
Security and text utilities for prompt injection defense, SSRF validation, and token estimation.
"""

import ipaddress
import re
from urllib.parse import urlparse


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

        if hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"):
            return False

        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
                return False
        except ValueError:
            # Hostname is a domain name
            pass

        return True
    except Exception:
        return False
