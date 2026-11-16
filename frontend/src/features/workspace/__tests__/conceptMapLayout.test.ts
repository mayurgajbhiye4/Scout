import { describe, it, expect } from 'vitest';
import type { WorkspaceNode } from '../useWorkspaceData';
import { MAX_CONCEPTS, conceptCapacity, layoutConceptMap, pickConcepts, pillWidth } from '../canvas/conceptMapLayout';
import type { ViewLink } from '../canvas/graphView';

const node = (id: string, over: Partial<WorkspaceNode & { shared: boolean }> = {}) => ({
  id,
  label: id,
  type: 'Concept',
  isSource: false,
  isUser: false,
  sourceIds: [],
  degree: 0,
  ...over,
});
const link = (from: string, to: string, relationship = 'USES'): ViewLink => ({ source: from, target: to, relationship });

const NODES = ['Transformer', 'Self-attention', 'Softmax', 'T × T scores', 'nanoGPT', 'FlashAttention', 'KV cache', 'Loose end'].map((id) => node(id));
const LINKS = [
  link('Transformer', 'Self-attention'),
  link('Self-attention', 'Softmax'),
  link('Self-attention', 'T × T scores', 'BUILDS'),
  link('Transformer', 'nanoGPT', 'IMPLEMENTED_IN'),
  link('T × T scores', 'FlashAttention', 'REDUCED_BY'),
  link('nanoGPT', 'KV cache'),
];

describe('layoutConceptMap', () => {
  it('keeps every pill inside the map and clear of the others', () => {
    const many = Array.from({ length: MAX_CONCEPTS }, (_, i) => node(`Concept number ${i}`));
    const links = many.slice(1).map((n, i) => link(many[Math.floor(i / 3)]!.id, n.id));
    for (const aspect of [0.6, 1.4, 2.6]) {
      const { pills, width, height } = layoutConceptMap(many, links, aspect);
      const boxes = [...pills.values()];
      expect(boxes).toHaveLength(many.length);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(width);
        expect(b.y + b.h).toBeLessThanOrEqual(height);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${a.id} overlaps ${b.id} at aspect ${aspect}`).toBe(true);
        }
      }
    }
  });

  it('stays put: the same concepts give the same map, whatever order they arrive in', () => {
    const first = layoutConceptMap(NODES, LINKS, 1.8);
    const again = layoutConceptMap([...NODES].reverse(), [...LINKS].reverse(), 1.8);
    expect([...again.pills.entries()].sort()).toEqual([...first.pills.entries()].sort());
    expect(again.hubId).toBe(first.hubId);
  });

  it('makes the most connected concept the hub, and none when nothing is related', () => {
    expect(layoutConceptMap(NODES, LINKS, 1.8).hubId).toBe('Self-attention');
    expect(layoutConceptMap(NODES, [], 1.8).hubId).toBeNull();
  });

  it('runs each line from the edge of one pill to the edge of the other', () => {
    const { pills, edges } = layoutConceptMap(NODES, LINKS, 1.8);
    expect(edges).toHaveLength(LINKS.length);
    for (const e of edges) {
      const from = pills.get(e.link.source)!;
      const to = pills.get(e.link.target)!;
      // A pill is a line with round ends: a point on its outline is half its height from that line
      const offOutline = (box: typeof from, x: number, y: number) => {
        const r = box.h / 2;
        const nearest = Math.max(box.x + r, Math.min(box.x + box.w - r, x));
        return Math.abs(Math.hypot(x - nearest, y - (box.y + r)) - r);
      };
      expect(offOutline(from, e.x1, e.y1)).toBeLessThan(0.01);
      expect(offOutline(to, e.x2, e.y2)).toBeLessThan(0.01);
    }
  });

  it('never puts a relation name it calls clear on top of a pill', () => {
    const { pills, edges } = layoutConceptMap(NODES, LINKS, 1.8);
    for (const { label } of edges.filter((e) => e.label.clear)) {
      for (const box of pills.values()) {
        const overlaps = Math.abs(label.x - (box.x + box.w / 2)) < (label.w + box.w) / 2 && Math.abs(label.y - (box.y + box.h / 2)) < (20 + box.h) / 2;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('handles one concept, links to things not on the map, and nothing at all', () => {
    expect(layoutConceptMap([], [], 1.8)).toMatchObject({ width: 0, height: 0, edges: [], hubId: null });
    const { pills, edges } = layoutConceptMap([node('Alone')], [link('Alone', 'Elsewhere'), link('Alone', 'Alone')], 1.8);
    expect(pills.size).toBe(1);
    expect(edges).toEqual([]);
  });

  it('cuts a very long name short rather than growing without end', () => {
    expect(pillWidth('x'.repeat(200))).toBe(pillWidth('x'.repeat(100)));
    expect(pillWidth('Softmax')).toBeLessThan(pillWidth('Hard-dependency Skills'));
  });
});

describe('pickConcepts', () => {
  it('shows everything while it fits', () => {
    expect(pickConcepts(NODES, LINKS, 20)).toBe(NODES);
  });

  it('keeps related concepts over loose ones, then shared ones, in their original order', () => {
    const nodes = [node('loose'), node('a'), node('shared-loose', { shared: true }), node('b'), node('c')];
    const links = [link('a', 'b'), link('b', 'c')];
    expect(pickConcepts(nodes, links, 3).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(pickConcepts(nodes, links, 4).map((n) => n.id)).toEqual(['a', 'shared-loose', 'b', 'c']);
  });
});

describe('conceptCapacity', () => {
  it('gives a small map fewer concepts and never more than the cap', () => {
    expect(conceptCapacity(340, 560)).toBeLessThan(conceptCapacity(1200, 640));
    expect(conceptCapacity(4000, 3000)).toBe(MAX_CONCEPTS);
    expect(conceptCapacity(0, 0)).toBeGreaterThan(0);
  });
});
