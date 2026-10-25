"""Query keyword extraction shared by graph lookups and lexical relevance scoring."""

import re

STOPWORDS = frozenset(
    """
    a about above after again against all also am an and any are as at be because been before being below
    between both but by can could did do does doing down during each either else ever few for from further
    get gets give had has have having he her here hers him his how however i if in into is it its itself
    just let like make many may me more most much must my no nor not now of off on once only or other our
    out over own please same say she should show so some such tell than that the their them then there these
    they this those through to too under until up upon us use used using very want was way we well were what
    whats when where which while who whom why will with within without would you your yours
    explain describe summarize summarise summary overview compare comparison difference differences between
    give list key main points thing things something anything everything kind kinds type types example examples
    """.split()
)

_WORD = re.compile(r"[a-z0-9][a-z0-9+#.\-]*[a-z0-9+#]|[a-z0-9]")


def extract_query_keywords(query: str, max_keywords: int = 12) -> list[str]:
    """Distinct, meaningful lowercase terms from a query, in order of appearance."""
    seen: set[str] = set()
    keywords: list[str] = []
    for word in _WORD.findall((query or "").lower()):
        if len(word) < 3 or word in STOPWORDS or word.isdigit() or word in seen:
            continue
        seen.add(word)
        keywords.append(word)
        if len(keywords) >= max_keywords:
            break
    return keywords


def keyword_overlap(keywords: list[str], text: str) -> float:
    """Fraction of keywords that appear in the text (0.0 when there are no keywords)."""
    if not keywords:
        return 0.0
    haystack = (text or "").lower()
    return sum(1 for kw in keywords if kw in haystack) / len(keywords)
