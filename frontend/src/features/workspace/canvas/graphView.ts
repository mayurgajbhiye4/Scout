import { isPersonalRelationship, MEMORY_RELATIONSHIPS, type WorkspaceGraph, type WorkspaceLink, type WorkspaceNode } from '../useWorkspaceData';

/**
 * What the map is about: one source, a few sources side by side, or the sources of one research session. Without a
 * scope the map shows nothing, so it always follows what the user is working on rather than the whole library.
 */
export interface MapScope {
  kind: 'source' | 'compare' | 'session';
  title: string;
  sourceIds: Set<string>;
}

/** The '*' chip: everything in scope that is about the material (mentions and relations), nothing about you. */
export const ALL_RELATIONS = '*';

/** The Shared chip: only what two or more of the scope's sources have in common. */
export const SHARED_VIEW = '~shared';

/**
 * `quiet` links (a source's mentions, under '*') are drawn as faint context: no arrow, no label.
 * `bridge` keeps a quiet link unlabelled but draws it solid: in the Shared view the mentions are what's being shown.
 */
export type ViewLink = WorkspaceLink & { quiet?: boolean; bridge?: boolean };

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

/** Whether two or more of these sources mention the concept. A concept's own sourceIds span the whole library. */
export function isSharedIn(node: WorkspaceNode, sourceIds: ReadonlySet<string>) {
  if (node.isSource || node.isUser) return false;
  return new Set(node.sourceIds.filter((id) => sourceIds.has(id))).size > 1;
}

export function countShared(nodes: WorkspaceNode[], sourceIds: ReadonlySet<string>) {
  return nodes.filter((n) => isSharedIn(n, sourceIds)).length;
}

/**
 * What's on screen for a chip. '*' shows the material: every source in scope (even one with nothing extracted yet),
 * its mentions as faint context, and the concept relations as labelled arrows. A chip shows only its relation, and
 * Shared shows the concepts `sourceIds` have in common, the sources that mention them, and the relations among them.
 */
export function buildView(
  scoped: { nodes: WorkspaceNode[]; links: WorkspaceLink[] },
  filter: string,
  sourceIds: ReadonlySet<string> = new Set()
): GraphView {
  if (filter === SHARED_VIEW) {
    const shared = new Set(scoped.nodes.filter((n) => isSharedIn(n, sourceIds)).map((n) => n.id));
    const links = scoped.links.filter((l) =>
      l.relationship === 'MENTIONS' ? shared.has(l.target) : isConceptRelation(l.relationship) && shared.has(l.source) && shared.has(l.target)
    );
    const touched = new Set(links.flatMap((l) => [l.source, l.target]));
    return {
      nodes: scoped.nodes.filter((n) => touched.has(n.id)),
      links: links.map((l) => (l.relationship === 'MENTIONS' ? { ...l, quiet: true, bridge: true } : l)),
    };
  }
  const all = filter === ALL_RELATIONS;
  const links = scoped.links.filter((l) => (all ? !isPersonalRelationship(l.relationship) : l.relationship === filter));
  const touched = new Set(links.flatMap((l) => [l.source, l.target]));
  return {
    nodes: scoped.nodes.filter((n) => touched.has(n.id) || (all && n.isSource)),
    links: links.map((l) => (all && l.relationship === 'MENTIONS' ? { ...l, quiet: true } : l)),
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
 * Ctrl/⌘-clicking a source. The one already selected joins the set; two or more are compared side by side, one left
 * over is an ordinary selection, and none goes back to the whole session.
 */
export function nextCompare(
  compared: ReadonlySet<string>,
  selected: string | null,
  id: string
): { compared: Set<string>; selected: string | null } {
  const next = new Set(compared.size > 0 ? compared : selected ? [selected] : []);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  if (next.size >= 2) return { compared: next, selected: null };
  return { compared: new Set(), selected: [...next][0] ?? null };
}

// Most connected first, then by name, so lists are stable across refetches
function byDegree(a: WorkspaceNode, b: WorkspaceNode) {
  return b.degree - a.degree || a.label.localeCompare(b.label);
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

// Relations come in three colors only: green for agreement, red for opposition, and white (ink in light mode) for
// everything else. Structural edges stay a quieter grey. The relation's name is on the line, so color never decides alone.
const GREEN = { light: '#15803d', dark: '#4ade80' };
const RED = { light: '#b91c1c', dark: '#f87171' };
const WHITE = { light: '#334155', dark: '#e4e4e7' };

const STRUCTURAL: Record<string, { light: string; dark: string }> = {
  MENTIONS: { light: '#64748b', dark: '#a1a1aa' },
  EXTRACTED_FROM: { light: '#94a3b8', dark: '#71717a' },
};
// Read from the relation's words, so relations the extractor names freely still land on the right side
const OPPOSING = /CONTRADICT|CONTRAST|CONFLICT|OPPOS|CRITIC|REFUT|DISAGREE|DISLIKE|REJECT|UNDERMIN|WEAKEN|COMPETES|AGAINST/;
const AGREEING = /SUPPORT|AGREE|ENABLE|IMPROVE|STRENGTHEN|CONFIRM|ENDORSE|LIKES|BENEFIT|COMPLEMENT/;

export function relationColor(relationship: string, isLight: boolean) {
  const rel = relationship.toUpperCase();
  const hue = STRUCTURAL[rel] ?? (OPPOSING.test(rel) ? RED : AGREEING.test(rel) ? GREEN : WHITE);
  return isLight ? hue.light : hue.dark;
}
