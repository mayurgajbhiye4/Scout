"""
Evidence quotes for an answer's claims, picked without another model call.

A claim is a sentence of the answer, in its paragraph or in a bullet, that carries citation markers
("... seam placement [1]."). For each source a claim cites, the passage of that source that shares the most content
words with the claim becomes the quote the chat shows when that citation is opened. Claims are keyed by `claim_key`,
which the frontend mirrors (`claimKey` in frontend/src/lib/citations.ts) to find the same sentence in the rendered
answer. Each cited source also gets one quote for the answer as a whole, shown when a citation has none of its own.
"""
import re
from typing import Any, Dict, List

MAX_QUOTE_CHARS = 300
# A quote must share at least this many content words with its claim, and this share of them
MIN_OVERLAP_WORDS = 2
MIN_OVERLAP_SHARE = 0.35

_CITATION = re.compile(r"\[(\d{1,3})\]")
_CODE_FENCE = re.compile(r"```.*?(?:```|$)", re.S)
_INLINE_CODE = re.compile(r"`[^`]*`")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_LIST_PREFIX = re.compile(r"^\s*(?:[-*+•]|\d+[.)])\s+")
# A sentence ends at . ! or ? (with any citation markers just after it) followed by whitespace
_SENTENCE_END = re.compile(r"(?<=[.!?])((?:\s*\[\d{1,3}\])*)\s+")
_WORD = re.compile(r"[a-z0-9][a-z0-9'-]{2,}")
_STOPWORDS = frozenset(
    "the and for are but not you all any can had her was one our out has have his how its may new now old see two "
    "who did get him let put say she too use that with this from they will would there their what which when where "
    "while into than then them these those been being also more most such only other some very just over both each "
    "few same own does doing could should about after again against because before between during through under "
    "until above below further once here why whom itself instead rather".split()
)


def claim_key(text: str) -> str:
    """Comparable form of a claim: no markers or markdown punctuation, lowercase, single spaces, no end punctuation."""
    text = _CITATION.sub("", text)
    text = _LINK.sub(r"\1", text)
    text = re.sub(r"[*_`~]", "", text)
    text = " ".join(text.lower().split())
    return text.rstrip(" .!?;:,")


def _sentences(line: str) -> List[str]:
    """Splits a line into sentences, keeping each sentence's trailing citation markers with it."""
    out, last = [], 0
    for m in _SENTENCE_END.finditer(line):
        out.append(line[last:m.end(1)])
        last = m.end()
    out.append(line[last:])
    return [s.strip() for s in out if s.strip()]


def split_claims(answer_md: str) -> List[Dict[str, Any]]:
    """The cited sentences of an answer, in order, as {key, citations}."""
    text = _CODE_FENCE.sub("", answer_md)
    claims: List[Dict[str, Any]] = []
    seen: set = set()
    for raw_line in text.splitlines():
        line = _INLINE_CODE.sub("", _LIST_PREFIX.sub("", raw_line))
        for sentence in _sentences(line):
            nums = [int(n) for n in _CITATION.findall(sentence)]
            key = claim_key(sentence)
            if not nums or not key or key in seen:
                continue
            seen.add(key)
            claims.append({"key": key, "citations": list(dict.fromkeys(nums))})
    return claims


def _content_words(text: str) -> set:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOPWORDS}


def _windows(content: str) -> List[str]:
    """One- and two-sentence windows of a passage, each at most MAX_QUOTE_CHARS long."""
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", " ".join(content.split())) if p.strip()]
    windows = []
    for i, part in enumerate(parts):
        windows.append(part)
        if i + 1 < len(parts):
            windows.append(f"{part} {parts[i + 1]}")
    return [w if len(w) <= MAX_QUOTE_CHARS else w[: MAX_QUOTE_CHARS - 1].rsplit(" ", 1)[0] + "…" for w in windows]


def _best_window(words: set, source: Dict[str, Any], needed: float | None = None) -> Dict[str, Any] | None:
    """The passage window that shares the most content words with the claim, or None when none shares enough
    to actually support it (a single common word is not evidence)."""
    if needed is None:
        needed = max(MIN_OVERLAP_WORDS, MIN_OVERLAP_SHARE * len(words))
    best, best_score = None, 0.0
    for chunk in source.get("chunks", []):
        for window in _windows(chunk.get("content") or ""):
            overlap = len(words & _content_words(window))
            # Prefer tighter quotes when two windows share as many words
            score = overlap - len(window) / 10_000
            if overlap >= needed and score > best_score:
                best, best_score = {"quote": window, "chunk_index": chunk.get("chunk_index", 0)}, score
    return best


def _source_quote(answer_words: set, source: Dict[str, Any]) -> Dict[str, Any] | None:
    """The passage of a source closest to the answer as a whole; its opening passage when nothing overlaps."""
    best = _best_window(answer_words, source, needed=1)
    if best:
        return best
    for chunk in source.get("chunks", []):
        windows = _windows(chunk.get("content") or "")
        if windows:
            return {"quote": windows[0], "chunk_index": chunk.get("chunk_index", 0)}
    return None


def select_evidence(answer_md: str, sources_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    {claims: [{key, citation_index, quote, chunk_index}], sources: {"<n>": {quote, chunk_index}}}.

    `claims` has one quote for every source a cited sentence names, when that source has a passage supporting it:
    a sentence citing [2][3] can have two. `sources` has one quote per cited source, for citations whose sentence
    has none of its own; it is left out when empty.

    `sources_list` is numbered from 1 in the order the prompt listed it. Knowledge-graph sources are skipped:
    their "passage" is a list of graph facts, not something a reader would recognise as a quote.
    """
    def quotable(num: int) -> bool:
        return 1 <= num <= len(sources_list) and sources_list[num - 1].get("kind") != "graph"

    claims = split_claims(answer_md)
    claims_out: List[Dict[str, Any]] = []
    for claim in claims:
        words = _content_words(claim["key"])
        for num in claim["citations"]:
            best = _best_window(words, sources_list[num - 1]) if quotable(num) else None
            if best:
                claims_out.append({"key": claim["key"], "citation_index": num, **best})

    answer_words = _content_words(" ".join(c["key"] for c in claims))
    sources_out: Dict[str, Any] = {}
    for num in sorted({n for c in claims for n in c["citations"] if quotable(n)}):
        quote = _source_quote(answer_words, sources_list[num - 1])
        if quote:
            sources_out[str(num)] = quote

    evidence: Dict[str, Any] = {"claims": claims_out}
    if sources_out:
        evidence["sources"] = sources_out
    return evidence
