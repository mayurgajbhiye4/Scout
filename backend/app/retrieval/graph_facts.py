"""Formatting for knowledge graph evidence (kept free of Neo4j imports so it is cheap to use anywhere)."""

from typing import Any

MAX_RELATIONS = 12


def relations_from_entities(
    entities: list[dict[str, Any]],
    definitions: dict[str, str] | None = None,
    limit: int = MAX_RELATIONS,
) -> list[dict[str, Any]]:
    """Directed, de-duplicated relations between matched entities and their neighbours, numbered R1, R2, ...

    The model may only point at these ids when it names how concepts connect, so every relation it shows
    is an edge that really is in the user's graph. `definitions` maps a relation name to its one-line meaning.
    """
    relations: list[dict[str, Any]] = []
    seen: set = set()
    for ent in entities:
        for nb in ent.get("neighbors", []):
            rel = nb.get("relationship")
            if not rel or not nb.get("label"):
                continue
            here = (ent["label"], ent.get("type") or "Concept")
            there = (nb["label"], nb.get("type") or "Concept")
            (source, source_type), (target, target_type) = (
                (here, there) if nb.get("outgoing", True) else (there, here)
            )
            key = (source.lower(), rel, target.lower())
            if key in seen:
                continue
            seen.add(key)
            relations.append(
                {
                    "id": f"R{len(relations) + 1}",
                    "source": source,
                    "source_type": source_type,
                    "relationship": rel,
                    "target": target,
                    "target_type": target_type,
                    "description": (nb.get("description") or "").strip()[:240],
                    "definition": (definitions or {}).get(rel, ""),
                }
            )
            if len(relations) >= limit:
                return relations
    return relations


def format_graph_facts(evidence: dict[str, Any]) -> str:
    """Readable fact lines for the LLM prompt, one per matched entity, then the numbered relations."""
    lines = []
    for ent in evidence.get("entities", []):
        line = f"- {ent['label']} ({ent.get('type') or 'Concept'})"
        titles = [d.get("title") for d in ent.get("documents", []) if d.get("title")]
        if titles:
            line += " — mentioned in: " + ", ".join(f"'{t}'" for t in titles)
        neighbors = [
            f"{nb['label']} ({nb.get('type') or 'Concept'})" for nb in ent.get("neighbors", [])
        ]
        if neighbors:
            line += "; related to: " + ", ".join(neighbors)
        lines.append(line)
    relations = evidence.get("relations") or []
    if relations:
        lines.append("Relations:")
        for r in relations:
            line = f"{r['id']}: {r['source']} ({r['source_type']}) —{r['relationship']}→ {r['target']} ({r['target_type']})"
            if r.get("description"):
                line += f" — {r['description']}"
            lines.append(line)
    return "\n".join(lines)
