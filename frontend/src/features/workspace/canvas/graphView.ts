import { isPersonalRelationship, MEMORY_RELATIONSHIPS, type WorkspaceGraph, type WorkspaceLink, type WorkspaceNode } from '../useWorkspaceData';

/**
 * What the map is about: one source, or the sources of one research session. Without a scope the map shows nothing,
 * so it always follows what the user is working on rather than the whole library.
 */
export interface MapScope {
  kind: 'source' | 'session';
  title: string;
  sourceIds: Set<string>;
}

/** The '*' chip: everything in scope that is about the material (mentions and relations), nothing about you. */
export const ALL_RELATIONS = '*';

/** `quiet` links (a source's mentions, under '*') are drawn as faint context: no arrow, no label unless focused. */
export type ViewLink = WorkspaceLink & { curvature: number; quiet?: boolean };

// Every entity type has its own figure AND color, so identity never rests on color alone
export type NodeShape = 'circle' | 'square' | 'person' | 'building' | 'chip' | 'book';
export type NodeMark = { shape: NodeShape; color: string };

export interface GraphView {
  nodes: WorkspaceNode[];
  links: ViewLink[];
}

/** A relation extracted between two concepts, as opposed to source → concept or anything about you. */
export function isConceptRelation(relationship: string) {
  return relationship !== 'MENTIONS' && !isPersonalRelationship(relationship);
}

/**
 * The part of the graph a scope covers: its sources, the concepts they mention, the mentions, the relations among
 * those concepts, and your memory edges into them (bringing You in only then). Source → you edges are left out.
 */
export function scopeGraph(graph: WorkspaceGraph, sourceIds: Set<string>): { nodes: WorkspaceNode[]; links: WorkspaceLink[] } {
  const mapped = new Set(graph.nodes.filter((n) => n.isSource).map((n) => n.id));
  const inScope = new Set<string>();
  for (const id of sourceIds) {
    if (!mapped.has(id)) continue;
    inScope.add(id);
    graph.entitiesBySource.get(id)?.forEach((e) => inScope.add(e));
  }
  const links = graph.links.filter((l) => {
    if (l.relationship === 'MENTIONS') return sourceIds.has(l.source) && inScope.has(l.target);
    if (MEMORY_RELATIONSHIPS.has(l.relationship)) return inScope.has(l.target);
    return isConceptRelation(l.relationship) && inScope.has(l.source) && inScope.has(l.target);
  });
  const ids = new Set(inScope);
  for (const l of links) ids.add(l.source);
  return { nodes: graph.nodes.filter((n) => ids.has(n.id)), links };
}

/**
 * What's on screen for a chip. '*' shows the material: every source in scope (even one with nothing extracted yet),
 * its mentions as faint context, and the concept relations as labelled arrows. A chip shows only its relation.
 */
export function buildView(scoped: { nodes: WorkspaceNode[]; links: WorkspaceLink[] }, filter: string): GraphView {
  const all = filter === ALL_RELATIONS;
  const links = scoped.links.filter((l) => (all ? !isPersonalRelationship(l.relationship) : l.relationship === filter));
  const touched = new Set(links.flatMap((l) => [l.source, l.target]));
  return {
    nodes: scoped.nodes.filter((n) => touched.has(n.id) || (all && n.isSource)),
    links: withCurvature(links).map((l) => (all && l.relationship === 'MENTIONS' ? { ...l, quiet: true } : l)),
  };
}

export interface RelationCount {
  relationship: string;
  count: number;
}

/** One chip per relation type: concept relations by count, then MENTIONS, then the ones about you. */
export function countRelations(links: WorkspaceLink[]): { all: number; types: RelationCount[] } {
  const counts = new Map<string, number>();
  for (const l of links) counts.set(l.relationship, (counts.get(l.relationship) ?? 0) + 1);
  const rank = (rel: string) => (isConceptRelation(rel) ? 0 : rel === 'MENTIONS' ? 1 : 2);
  const types = Array.from(counts, ([relationship, count]) => ({ relationship, count })).sort(
    (a, b) => rank(a.relationship) - rank(b.relationship) || b.count - a.count || a.relationship.localeCompare(b.relationship)
  );
  const all = types.reduce((sum, t) => sum + (isPersonalRelationship(t.relationship) ? 0 : t.count), 0);
  return { all, types };
}

/**
 * Parallel and opposite edges between the same two nodes bend apart so each keeps its own arrow and label. Curvature
 * is relative to the link's own direction, so a reversed link flips its sign to land on the side it was given.
 */
export function withCurvature(links: WorkspaceLink[]): ViewLink[] {
  const pairKey = (l: WorkspaceLink) => (l.source < l.target ? `${l.source}|${l.target}` : `${l.target}|${l.source}`);
  const groups = new Map<string, number>();
  for (const l of links) groups.set(pairKey(l), (groups.get(pairKey(l)) ?? 0) + 1);
  const placed = new Map<string, number>();
  return links.map((l) => {
    const key = pairKey(l);
    const size = groups.get(key)!;
    if (size === 1) return { ...l, curvature: 0 };
    const i = placed.get(key) ?? 0;
    placed.set(key, i + 1);
    const c = (i - (size - 1) / 2) * 0.5;
    return { ...l, curvature: l.source < l.target ? c : -c };
  });
}

// Typed as ids, but the 3D layout swaps a link's ends for the node objects once it starts
export function endpointId(end: unknown): string {
  return typeof end === 'object' && end !== null ? String((end as { id?: unknown }).id) : String(end);
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Word-wraps into at most `maxLines` lines of about `width` characters, with an ellipsis if it ran over. */
export function wrapText(text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const word = words[i]!;
    if (line && line.length + 1 + word.length > width) {
      if (lines.length + 1 === maxLines) break;
      lines.push(line);
      line = '';
    }
    line = line ? `${line} ${word}` : word;
  }
  lines.push(i < words.length ? `${line}…` : line);
  return lines.map((l) => truncate(l, width + 1));
}

// Most connected first, then by name, so lists and label picks are stable across refetches
function byDegree(a: WorkspaceNode, b: WorkspaceNode) {
  return b.degree - a.degree || a.label.localeCompare(b.label);
}

/** The nodes that keep their name on the map at any zoom: sources and you first, then the most connected. */
export function pickLabelled(nodes: WorkspaceNode[], budget: number): Set<string> {
  const ranked = [...nodes].sort((a, b) => Number(b.isSource || b.isUser) - Number(a.isSource || a.isUser) || byDegree(a, b));
  return new Set(ranked.slice(0, Math.max(0, budget)).map((n) => n.id));
}

export interface EntityGroup {
  label: string;
  nodes: WorkspaceNode[];
}

/**
 * The navigator's list: what matches the query (name or description) and the picked groups, grouped in `order`
 * (groups it doesn't name go last), most connected first within each. You aren't listed; you can't be picked.
 */
export function groupEntities(
  nodes: WorkspaceNode[],
  query: string,
  groups: Set<string> | null,
  groupOf: (n: WorkspaceNode) => string,
  order: string[]
): EntityGroup[] {
  const q = query.trim().toLowerCase();
  const byGroup = new Map<string, WorkspaceNode[]>();
  for (const n of nodes) {
    if (n.isUser) continue;
    const group = groupOf(n);
    if (groups && !groups.has(group)) continue;
    if (q && !n.label.toLowerCase().includes(q) && !n.description?.toLowerCase().includes(q)) continue;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(n);
  }
  const rank = (label: string) => (order.includes(label) ? order.indexOf(label) : order.length);
  return Array.from(byGroup, ([label, members]) => ({ label, nodes: members.sort(byDegree) })).sort(
    (a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label)
  );
}

/** 'CREATED_BY' → 'created by' */
export function prettyRelation(relationship: string) {
  return relationship.toLowerCase().replace(/_+/g, ' ').trim();
}

// Relation hues. They sit apart from teal (focus) and the node palette is shape-coded, so color alone never decides.
const RELATION_HUES = [
  { light: '#4f46e5', dark: '#818cf8' }, // indigo
  { light: '#c2410c', dark: '#fb923c' }, // orange
  { light: '#be185d', dark: '#f472b6' }, // pink
  { light: '#0369a1', dark: '#38bdf8' }, // sky
  { light: '#7e22ce', dark: '#c084fc' }, // purple
  { light: '#a16207', dark: '#facc15' }, // gold
  { light: '#15803d', dark: '#4ade80' }, // green
  { light: '#b91c1c', dark: '#f87171' }, // red
];

// Fixed colors where the meaning is fixed: structural edges stay neutral, evidence reads as for/against, memory edges as feelings
const FIXED_HUES: Record<string, { light: string; dark: string }> = {
  MENTIONS: { light: '#64748b', dark: '#a1a1aa' },
  EXTRACTED_FROM: { light: '#94a3b8', dark: '#71717a' },
  SUPPORTS: { light: '#15803d', dark: '#4ade80' },
  CONTRADICTS: { light: '#b91c1c', dark: '#f87171' },
  LIKES: { light: '#15803d', dark: '#4ade80' },
  DISLIKES: { light: '#b91c1c', dark: '#f87171' },
  EXPLORED: { light: '#0369a1', dark: '#38bdf8' },
  CURIOUS_ABOUT: { light: '#7e22ce', dark: '#c084fc' },
};

export function relationColor(relationship: string, isLight: boolean) {
  const fixed = FIXED_HUES[relationship];
  if (fixed) return isLight ? fixed.light : fixed.dark;
  let h = 0;
  for (let i = 0; i < relationship.length; i++) h = (h * 31 + relationship.charCodeAt(i)) >>> 0;
  const hue = RELATION_HUES[h % RELATION_HUES.length]!;
  return isLight ? hue.light : hue.dark;
}
