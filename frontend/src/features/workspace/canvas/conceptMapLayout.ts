import type { WorkspaceNode } from '../useWorkspaceData';
import { prettyRelation, type ViewLink } from './graphView';

/**
 * Where each concept of the knowledge map sits. Concepts are pills joined by straight lines, spread by a small
 * force layout: linked concepts pull together, all of them push apart, and the most connected one holds the middle.
 * The layout is a pure function of what's on the map (never of the order it arrived in, or of chance), so a map
 * stays exactly where it is until its concepts or relations change.
 */

export const PILL_H = 34;
const PILL_MIN_W = 84;
const PILL_MAX_W = 248;
export const LABEL_H = 20;
/** Kept clear inside the map's edges, where the board fades out. */
const PAD = 30;
// The least room between two pills
const GAP_X = 26;
const GAP_Y = 20;
// How much emptier the map is than its pills packed tight; the marketing map's own ratio
const AIRINESS = 2.2;
const MIN_AREA = 150_000;
const ITERATIONS = 320;
// How hard everything leans to the middle: keeps unrelated groups of concepts beside each other, not in the corners
const GRAVITY = 1.5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Room one concept needs on screen for the map to stay readable; decides how many a map of a given size shows. */
const AREA_PER_CONCEPT = 34_000;
const MIN_CONCEPTS = 5;
export const MAX_CONCEPTS = 28;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Close enough to the 13px semibold a pill is set in, without measuring the DOM
function textWidth(text: string) {
  let w = 0;
  for (const ch of text) w += /[mwMW@%]/.test(ch) ? 11.5 : /[A-Z0-9]/.test(ch) ? 8.8 : /[iljtfrI .,:;'|!()/-]/.test(ch) ? 4.8 : 7.6;
  return w;
}

/** A pill is as wide as its name, up to a point; past that the name is cut short. */
export const pillWidth = (label: string) => Math.round(clamp(textWidth(label) + 48, PILL_MIN_W, PILL_MAX_W));
const relationWidth = (name: string) => Math.round(name.length * 6.2 + 18);

export interface PillBox {
  id: string;
  /** Top-left corner */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapEdge {
  key: string;
  link: ViewLink;
  /** From the edge of the source's pill to the edge of the target's */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Where the relation's name goes. `clear` is false when it would sit on a pill or another name. */
  label: { x: number; y: number; w: number; clear: boolean };
}

export interface ConceptMapLayout {
  width: number;
  height: number;
  pills: Map<string, PillBox>;
  edges: MapEdge[];
  /** The most connected concept, drawn in the accent; null when nothing on the map is related. */
  hubId: string | null;
}

/** How many concepts a map of this size holds without crowding. */
export function conceptCapacity(width: number, height: number) {
  return clamp(Math.floor((width * height) / AREA_PER_CONCEPT), MIN_CONCEPTS, MAX_CONCEPTS);
}

function linkCounts(nodes: WorkspaceNode[], links: ViewLink[]) {
  const counts = new Map(nodes.map((n) => [n.id, 0]));
  for (const l of links) {
    if (l.source === l.target || !counts.has(l.source) || !counts.has(l.target)) continue;
    counts.set(l.source, counts.get(l.source)! + 1);
    counts.set(l.target, counts.get(l.target)! + 1);
  }
  return counts;
}

/**
 * The concepts that make the map when there are more than fit: the ones related to something else on it, then the
 * ones several sources share, then the most connected. Returned in their original order.
 */
export function pickConcepts<T extends WorkspaceNode & { shared?: boolean }>(nodes: T[], links: ViewLink[], max: number): T[] {
  if (nodes.length <= max) return nodes;
  const counts = linkCounts(nodes, links);
  const ranked = [...nodes].sort(
    (a, b) =>
      Number(counts.get(b.id)! > 0) - Number(counts.get(a.id)! > 0) ||
      Number(b.shared ?? false) - Number(a.shared ?? false) ||
      counts.get(b.id)! - counts.get(a.id)! ||
      b.degree - a.degree ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id)
  );
  const kept = new Set(ranked.slice(0, max).map((n) => n.id));
  return nodes.filter((n) => kept.has(n.id));
}

interface Body {
  id: string;
  w: number;
  /** Centre */
  x: number;
  y: number;
}

/** Where a line leaving a pill's centre towards (dx, dy) crosses its outline: flat on top and bottom, round at the ends. */
function pillExit(w: number, dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const r = PILL_H / 2;
  const flat = Math.max(0, w / 2 - r);
  if (Math.abs(uy) > 1e-6) {
    const t = r / Math.abs(uy);
    if (Math.abs(ux * t) <= flat) return { x: ux * t, y: uy * t };
  }
  // Through the rounded end on the side it's heading for
  const cx = Math.sign(ux || 1) * flat;
  const b = ux * cx;
  const t = b + Math.sqrt(Math.max(0, b * b - (cx * cx - r * r)));
  return { x: ux * t, y: uy * t };
}

export function layoutConceptMap(nodes: WorkspaceNode[], links: ViewLink[], aspect: number): ConceptMapLayout {
  const pills = new Map<string, PillBox>();
  if (nodes.length === 0) return { width: 0, height: 0, pills, edges: [], hubId: null };

  // Sorted, so the same concepts always give the same map whatever order they were fetched in
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(sorted.map((n) => n.id));
  const seen = new Set<string>();
  const edgesIn = links
    .filter((l) => {
      const key = `${l.source}|${l.target}|${l.relationship}`;
      if (l.source === l.target || !ids.has(l.source) || !ids.has(l.target) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.relationship.localeCompare(b.relationship));

  const counts = linkCounts(sorted, edgesIn);
  const byWeight = (a: WorkspaceNode, b: WorkspaceNode) =>
    counts.get(b.id)! - counts.get(a.id)! || b.degree - a.degree || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  const ranked = [...sorted].sort(byWeight);
  const hub = ranked[0]!;
  const hubId = counts.get(hub.id)! > 0 ? hub.id : null;

  const widths = new Map(sorted.map((n) => [n.id, pillWidth(n.label)]));
  const packed = sorted.reduce((sum, n) => sum + (widths.get(n.id)! + GAP_X * 2) * (PILL_H + GAP_Y * 2), 0);
  const area = Math.max(MIN_AREA, packed * AIRINESS);
  const height = Math.round(Math.sqrt(area / aspect));
  const width = Math.round(height * aspect);

  // ── Starting places: outwards from the hub in the order the relations reach each concept, so neighbours start close ──
  const adjacent = new Map<string, Set<string>>(sorted.map((n) => [n.id, new Set()]));
  for (const l of edgesIn) {
    adjacent.get(l.source)!.add(l.target);
    adjacent.get(l.target)!.add(l.source);
  }
  const byId = new Map(sorted.map((n) => [n.id, n]));
  const order: string[] = [];
  const placed = new Set<string>();
  for (const start of ranked) {
    if (placed.has(start.id)) continue;
    const queue = [start.id];
    placed.add(start.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      const next = [...adjacent.get(id)!].filter((n) => !placed.has(n)).map((n) => byId.get(n)!).sort(byWeight);
      for (const n of next) {
        placed.add(n.id);
        queue.push(n.id);
      }
    }
  }

  // Worked out on an open plane in units of one relation's length, then fitted to the map: the same concepts make
  // the same picture in a wide box or a tall one, only stretched
  const bodies: Body[] = order.map((id, i) => ({
    id,
    w: widths.get(id)!,
    x: Math.cos(i * GOLDEN_ANGLE) * Math.sqrt(i),
    y: Math.sin(i * GOLDEN_ANGLE) * Math.sqrt(i),
  }));
  const indexOf = new Map(bodies.map((b, i) => [b.id, i]));
  const pairs = edgesIn.map((l) => [indexOf.get(l.source)!, indexOf.get(l.target)!] as const);

  const dx = new Float64Array(bodies.length);
  const dy = new Float64Array(bodies.length);
  for (let step = 0; step < ITERATIONS; step++) {
    for (let i = 0; i < bodies.length; i++) {
      // Everything leans to the middle
      dx[i] = -bodies[i]!.x * GRAVITY;
      dy[i] = -bodies[i]!.y * GRAVITY;
    }
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        let ox = a.x - b.x;
        let oy = a.y - b.y;
        if (ox === 0 && oy === 0) {
          ox = 0.01;
          oy = 0.01;
        }
        // Every pair pushes apart, harder the closer they are
        const push = 1 / (ox * ox + oy * oy);
        dx[i]! += ox * push;
        dy[i]! += oy * push;
        dx[j]! -= ox * push;
        dy[j]! -= oy * push;
      }
    }
    for (const [i, j] of pairs) {
      // Related concepts pull together, harder the further apart
      const ox = bodies[i]!.x - bodies[j]!.x;
      const oy = bodies[i]!.y - bodies[j]!.y;
      const pull = Math.hypot(ox, oy);
      dx[i]! -= ox * pull;
      dy[i]! -= oy * pull;
      dx[j]! += ox * pull;
      dy[j]! += oy * pull;
    }
    const heat = 0.6 * (1 - step / ITERATIONS);
    bodies.forEach((b, i) => {
      const move = Math.hypot(dx[i]!, dy[i]!);
      if (move === 0) return;
      const scale = Math.min(move, heat) / move;
      b.x += dx[i]! * scale;
      b.y += dy[i]! * scale;
    });
  }

  // ── Onto the map: stretched to fill it, inside its edges, and apart, no two pills closer than the gap ──
  const hold = (b: Body) => {
    b.x = clamp(b.x, PAD + b.w / 2, Math.max(PAD + b.w / 2, width - PAD - b.w / 2));
    b.y = clamp(b.y, PAD + PILL_H / 2, Math.max(PAD + PILL_H / 2, height - PAD - PILL_H / 2));
  };
  const fit = (value: number, min: number, max: number, size: number, inset: number) =>
    max - min < 1e-6 ? size / 2 : inset + ((value - min) / (max - min)) * (size - inset * 2);
  const xs = bodies.map((b) => b.x);
  const ys = bodies.map((b) => b.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const b of bodies) {
    b.x = fit(b.x, minX, maxX, width, PAD + PILL_MIN_W / 2);
    b.y = fit(b.y, minY, maxY, height, PAD + PILL_H / 2);
    hold(b);
  }
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const overX = (a.w + b.w) / 2 + GAP_X - Math.abs(a.x - b.x);
        const overY = PILL_H + GAP_Y - Math.abs(a.y - b.y);
        if (overX <= 0 || overY <= 0) continue;
        moved = true;
        // Apart along whichever way is shorter; pills dead level with each other part by their order
        if (overY <= overX) {
          const dir = a.y === b.y ? -1 : Math.sign(a.y - b.y);
          a.y += (dir * overY) / 2;
          b.y -= (dir * overY) / 2;
        } else {
          const dir = a.x === b.x ? -1 : Math.sign(a.x - b.x);
          a.x += (dir * overX) / 2;
          b.x -= (dir * overX) / 2;
        }
        hold(a);
        hold(b);
      }
    }
    if (!moved) break;
  }

  for (const b of bodies) {
    pills.set(b.id, { id: b.id, x: Math.round(b.x - b.w / 2), y: Math.round(b.y - PILL_H / 2), w: b.w, h: PILL_H });
  }

  // ── Lines, from pill edge to pill edge, and where each relation's name can sit without covering anything ──
  const centre = (box: PillBox) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const boxes = [...pills.values()];
  const takenLabels: Array<{ x: number; y: number; w: number }> = [];
  const betweenSame = new Map<string, number>();
  const pairKey = (l: ViewLink) => [l.source, l.target].sort().join('|');
  for (const l of edgesIn) betweenSame.set(pairKey(l), (betweenSame.get(pairKey(l)) ?? 0) + 1);
  const drawnBetween = new Map<string, number>();

  const edges: MapEdge[] = edgesIn.map((link) => {
    const from = pills.get(link.source)!;
    const to = pills.get(link.target)!;
    const a = centre(from);
    const b = centre(to);
    const out = pillExit(from.w, b.x - a.x, b.y - a.y);
    const into = pillExit(to.w, a.x - b.x, a.y - b.y);
    const x1 = a.x + out.x;
    const y1 = a.y + out.y;
    const x2 = b.x + into.x;
    const y2 = b.y + into.y;

    // Several relations between the same two concepts share a line; their names take turns along it
    const total = betweenSame.get(pairKey(link))!;
    const nth = drawnBetween.get(pairKey(link)) ?? 0;
    drawnBetween.set(pairKey(link), nth + 1);
    const base = 0.5 + (nth - (total - 1) / 2) * 0.24;

    const w = relationWidth(prettyRelation(link.relationship));
    const at = (t: number) => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    const isClear = (p: { x: number; y: number }) =>
      boxes.every((box) => Math.abs(p.x - (box.x + box.w / 2)) >= (w + box.w) / 2 + 4 || Math.abs(p.y - (box.y + box.h / 2)) >= (LABEL_H + box.h) / 2 + 4) &&
      takenLabels.every((other) => Math.abs(p.x - other.x) >= (w + other.w) / 2 + 4 || Math.abs(p.y - other.y) >= LABEL_H + 4);
    const spot = [base, base - 0.13, base + 0.13].map(at).find(isClear);
    const point = spot ?? at(base);
    if (spot) takenLabels.push({ ...spot, w });

    return {
      key: `${link.source}|${link.target}|${link.relationship}`,
      link,
      x1,
      y1,
      x2,
      y2,
      label: { x: point.x, y: point.y, w, clear: Boolean(spot) },
    };
  });

  return { width, height, pills, edges, hubId };
}
