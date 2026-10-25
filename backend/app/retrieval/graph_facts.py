"""Formatting for knowledge graph evidence (kept free of Neo4j imports so it is cheap to use anywhere)."""

from typing import Any, Dict


def format_graph_facts(evidence: Dict[str, Any]) -> str:
    """Readable fact lines for the LLM prompt, one per matched entity."""
    lines = []
    for ent in evidence.get("entities", []):
        line = f"- {ent['label']} ({ent.get('type') or 'Concept'})"
        titles = [d.get("title") for d in ent.get("documents", []) if d.get("title")]
        if titles:
            line += " — mentioned in: " + ", ".join(f"'{t}'" for t in titles)
        neighbors = [f"{nb['label']} ({nb.get('type') or 'Concept'})" for nb in ent.get("neighbors", [])]
        if neighbors:
            line += "; related to: " + ", ".join(neighbors)
        lines.append(line)
    return "\n".join(lines)
