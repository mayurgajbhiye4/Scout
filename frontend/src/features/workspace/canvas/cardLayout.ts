import type { WorkspaceNode } from '../useWorkspaceData';
import type { ViewLink } from './graphView';

/**
 * Where each card of the knowledge map sits, and how its connectors run. The map reads left to right: sources (or
 * whatever nothing points at) in the first column, and each card one column past the last card that points at it.
 * Every card sits in a cell of one grid, so the gaps between columns and rows line up into clear channels, and
 * connectors run along those instead of under cards.
 */

export const CARD_W = 232;
export const CARD_H = 100;
/** Sources and you are one-line pills, centred in a card's cell. */
export const PILL_H = 48;
export const COL_GAP = 96;
export const ROW_GAP = 28;
// A column taller than this wraps into several side by side
const MAX_ROWS = 6;
const CORNER = 10;
// Connectors leaving different cards keep apart in a shared channel: one of this many tracks each
const TRACKS = 5;
const COL_TRACK = 8;
const ROW_TRACK = 4;
// How far apart connectors arrive on one card's edge
const PORT_STEP = 16;

interface Point {
  x: number;
  y: number;
}

export interface CardBox {
  id: string;
  /** Top-left corner */
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
}

export interface CardEdge {
  key: string;
  link: ViewLink;
  /** SVG path from the source card's right edge to the target card's left edge */
  d: string;
  /** Where it arrives, for the arrowhead */
  end: Point;
  /** Where its relation name goes */
  label: Point;
}

export interface CardLayout {
  cards: Map<string, CardBox>;
  edges: CardEdge[];
  width: number;
  height: number;
}

const isPill = (n: WorkspaceNode) => n.isSource || n.isUser;

function byWeight(a: WorkspaceNode, b: WorkspaceNode) {
  return b.degree - a.degree || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

/**
 * The column each node belongs to: 0 when nothing points at it, else one past its furthest-right predecessor. Links
 * that close a cycle are left out of the count, so a loop can't push its own cards right forever.
 */
function layerOf(nodes: WorkspaceNode[], links: ViewLink[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  for (const l of links) {
    if (!ids.has(l.source) || !ids.has(l.target) || l.source === l.target) continue;
    if (!out.has(l.source)) out.set(l.source, []);
    out.get(l.source)!.push(l.target);
  }

  const state = new Map<string, 'open' | 'done'>();
  const preds = new Map<string, string[]>();
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const next of out.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === 'open') continue; // closes a cycle
      if (!preds.has(next)) preds.set(next, []);
      preds.get(next)!.push(id);
      if (!seen) visit(next);
    }
    state.set(id, 'done');
  };
  // Sources and you lead, so a cycle among concepts is broken where it reads most naturally
  const order = [...nodes].sort((a, b) => Number(isPill(b)) - Number(isPill(a)) || byWeight(a, b));
  for (const n of order) if (!state.has(n.id)) visit(n.id);

  const layer = new Map<string, number>();
  const depth = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    const d = Math.max(-1, ...(preds.get(id) ?? []).map(depth)) + 1;
    layer.set(id, d);
    return d;
  };
  nodes.forEach((n) => depth(n.id));
  return { layer, preds };
}

/** Right-angled path through the points, with its corners rounded off. */
function roundedPath(points: Point[]): { d: string; points: Point[] } {
  const pts: Point[] = [];
  for (const p of points) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    if (b && b.x === p.x && b.y === p.y) continue;
    // A point in line with the two around it isn't a corner
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) pts.pop();
    pts.push(p);
  }
  const first = pts[0]!;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const r = Math.min(CORNER, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const from = { x: b.x + Math.sign(a.x - b.x) * r, y: b.y + Math.sign(a.y - b.y) * r };
    const to = { x: b.x + Math.sign(c.x - b.x) * r, y: b.y + Math.sign(c.y - b.y) * r };
    d += ` L ${from.x} ${from.y} Q ${b.x} ${b.y} ${to.x} ${to.y}`;
  }
  const last = pts[pts.length - 1]!;
  if (pts.length > 1) d += ` L ${last.x} ${last.y}`;
  return { d, points: pts };
}

export function layoutCards(nodes: WorkspaceNode[], links: ViewLink[]): CardLayout {
  const cards = new Map<string, CardBox>();
  if (nodes.length === 0) return { cards, edges: [], width: 0, height: 0 };

  const { layer, preds } = layerOf(nodes, links);
  const byLayer: WorkspaceNode[][] = [];
  for (const n of nodes) (byLayer[layer.get(n.id)!] ??= []).push(n);

  // Relations decide where a card sits in its column; mentions only do when a card has nothing else
  const strongPreds = new Map<string, string[]>();
  for (const l of links) {
    if (l.quiet || (layer.get(l.source) ?? 0) >= (layer.get(l.target) ?? 0)) continue;
    if (!strongPreds.has(l.target)) strongPreds.set(l.target, []);
    strongPreds.get(l.target)!.push(l.source);
  }
  const leadsOn = new Set<string>();
  preds.forEach((list) => list.forEach((id) => leadsOn.add(id)));

  // ── Columns: each layer in the order of what feeds it, wrapped when it's too tall ──
  const columns: WorkspaceNode[][] = [];
  // A card's place relative to the middle of its column, in rows
  const offset = new Map<string, number>();
  for (const members of byLayer) {
    if (!members) continue;
    const pull = new Map<string, number>();
    for (const n of members) {
      const from = (strongPreds.get(n.id) ?? preds.get(n.id) ?? []).map((id) => offset.get(id) ?? 0);
      pull.set(n.id, from.length ? from.reduce((a, b) => a + b, 0) / from.length : 0);
    }
    const byPull = (a: WorkspaceNode, b: WorkspaceNode) => pull.get(a.id)! - pull.get(b.id)! || byWeight(a, b);
    const count = Math.ceil(members.length / MAX_ROWS);
    const perColumn = Math.ceil(members.length / count);
    // Wrapped: the cards that lead somewhere take the columns nearest to where they lead
    const ordered =
      count > 1
        ? [...members.filter((n) => !leadsOn.has(n.id)).sort(byPull), ...members.filter((n) => leadsOn.has(n.id)).sort(byPull)]
        : [...members].sort(byPull);
    for (let i = 0; i < ordered.length; i += perColumn) {
      const column = ordered.slice(i, i + perColumn).sort(byPull);
      column.forEach((n, row) => offset.set(n.id, row - (column.length - 1) / 2));
      columns.push(column);
    }
  }

  // ── Cells: every column centred on the same row grid ──
  const rows = Math.max(...columns.map((c) => c.length));
  const colX = (col: number) => col * (CARD_W + COL_GAP);
  const rowY = (row: number) => row * (CARD_H + ROW_GAP);
  columns.forEach((column, col) => {
    const start = Math.floor((rows - column.length) / 2);
    column.forEach((n, i) => {
      const row = start + i;
      const h = isPill(n) ? PILL_H : CARD_H;
      cards.set(n.id, { id: n.id, x: colX(col), y: rowY(row) + (CARD_H - h) / 2, w: CARD_W, h, col, row });
    });
  });

  // ── Connectors ──
  const centreY = (box: CardBox) => box.y + box.h / 2;
  // Relations arriving at one card spread along its edge, in the order of where they come from
  const arrivals = new Map<string, ViewLink[]>();
  for (const l of links) {
    if (l.quiet || !cards.has(l.source) || !cards.has(l.target)) continue;
    if (!arrivals.has(l.target)) arrivals.set(l.target, []);
    arrivals.get(l.target)!.push(l);
  }
  arrivals.forEach((list) => list.sort((a, b) => centreY(cards.get(a.source)!) - centreY(cards.get(b.source)!)));

  const edges: CardEdge[] = [];
  for (const link of links) {
    const from = cards.get(link.source);
    const to = cards.get(link.target);
    if (!from || !to) continue;

    // Everything leaving one card shares its track, so a source's mentions read as one trunk with branches
    const track = (from.row % TRACKS) - (TRACKS - 1) / 2;
    const channelX = (col: number) => colX(col) + CARD_W + COL_GAP / 2 + track * COL_TRACK;
    const channelY = (row: number) => rowY(row) - ROW_GAP / 2 + track * ROW_TRACK;

    const incoming = arrivals.get(link.target) ?? [];
    const port = link.quiet ? -1 : incoming.indexOf(link);
    const reach = Math.max(0, to.h / 2 - 14);
    const spread = port < 0 ? 0 : (port - (incoming.length - 1) / 2) * PORT_STEP;
    const start = { x: from.x + from.w, y: centreY(from) };
    const end = { x: to.x, y: centreY(to) + Math.max(-reach, Math.min(reach, spread)) };

    let route: Point[];
    if (to.col === from.col + 1) {
      // Next column over: one turn in the channel between them
      const x = channelX(from.col);
      route = [start, { x, y: start.y }, { x, y: end.y }, end];
    } else {
      // Further on, or back: out into the channel, along the gap beside the target's row, then in
      const outX = channelX(from.col);
      const inX = channelX(to.col - 1);
      const y = channelY(to.row < from.row ? to.row + 1 : to.row);
      route = [start, { x: outX, y: start.y }, { x: outX, y }, { x: inX, y }, { x: inX, y: end.y }, end];
    }

    const { d, points } = roundedPath(route);
    // The name sits on the last drop into the card when there's room, else on the run into it
    const a = points[points.length - 3];
    const b = points[points.length - 2]!;
    const label = a && Math.abs(b.y - a.y) >= 44 ? { x: b.x, y: (a.y + b.y) / 2 } : { x: (b.x + end.x) / 2, y: end.y };
    edges.push({ key: `${link.source}|${link.target}|${link.relationship}`, link, d, end, label });
  }

  return {
    cards,
    edges,
    width: columns.length * CARD_W + (columns.length - 1) * COL_GAP,
    height: rows * CARD_H + (rows - 1) * ROW_GAP,
  };
}
