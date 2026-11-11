import { describe, it, expect } from 'vitest';
import type { WorkspaceNode } from '../useWorkspaceData';
import { CARD_H, CARD_W, COL_GAP, PILL_H, layoutCards } from '../canvas/cardLayout';
import type { ViewLink } from '../canvas/graphView';

const node = (id: string, over: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id,
  label: id,
  type: 'Concept',
  isSource: false,
  isUser: false,
  sourceIds: [],
  degree: 0,
  ...over,
});
const source = (id: string) => node(id, { type: 'Document', isSource: true });
const link = (from: string, to: string, relationship = 'USES', over: Partial<ViewLink> = {}): ViewLink => ({
  source: from,
  target: to,
  relationship,
  ...over,
});
const mention = (from: string, to: string) => link(from, to, 'MENTIONS', { quiet: true });

describe('layoutCards', () => {
  it('reads left to right: sources first, each card one column past the last one pointing at it', () => {
    const { cards } = layoutCards(
      [source('doc'), node('a'), node('b'), node('c')],
      [mention('doc', 'a'), mention('doc', 'b'), mention('doc', 'c'), link('a', 'b'), link('b', 'c')]
    );
    expect(['doc', 'a', 'b', 'c'].map((id) => cards.get(id)!.col)).toEqual([0, 1, 2, 3]);
    expect(cards.get('a')!.x).toBe(CARD_W + COL_GAP);
  });

  it('makes sources pills, centred in the same cells as cards', () => {
    const { cards, height } = layoutCards([source('doc'), node('a')], [mention('doc', 'a')]);
    const doc = cards.get('doc')!;
    const a = cards.get('a')!;
    expect(doc.h).toBe(PILL_H);
    expect(a.h).toBe(CARD_H);
    expect(doc.y + doc.h / 2).toBe(a.y + a.h / 2);
    expect(height).toBe(CARD_H);
  });

  it('survives a cycle, and still gives every card its own cell', () => {
    const { cards, edges } = layoutCards([node('a'), node('b'), node('c')], [link('a', 'b'), link('b', 'c'), link('c', 'a')]);
    expect(cards.size).toBe(3);
    expect(edges).toHaveLength(3);
    const cells = new Set([...cards.values()].map((c) => `${c.col}:${c.row}`));
    expect(cells.size).toBe(3);
  });

  it('wraps a tall column into several, keeping the cards that lead on nearest to where they lead', () => {
    const leaves = Array.from({ length: 9 }, (_, i) => node(`leaf${i}`));
    const { cards } = layoutCards(
      [source('doc'), ...leaves, node('stem'), node('end')],
      [...leaves.map((n) => mention('doc', n.id)), mention('doc', 'stem'), mention('doc', 'end'), link('stem', 'end')]
    );
    const columns = new Set(leaves.map((n) => cards.get(n.id)!.col));
    expect(columns.size).toBe(2);
    expect(cards.get('stem')!.col).toBe(2);
    expect(cards.get('end')!.col).toBe(3);
    const cells = new Set([...cards.values()].map((c) => `${c.col}:${c.row}`));
    expect(cells.size).toBe(cards.size);
  });

  it('runs each connector from its source card to its target card, and spreads arrivals on one card', () => {
    const { cards, edges } = layoutCards([node('a'), node('b'), node('c')], [link('a', 'c'), link('b', 'c', 'PART_OF')]);
    const c = cards.get('c')!;
    for (const edge of edges) {
      const from = cards.get(edge.link.source)!;
      expect(edge.d.startsWith(`M ${from.x + from.w} ${from.y + from.h / 2}`)).toBe(true);
      expect(edge.end.x).toBe(c.x);
      expect(edge.end.y).toBeGreaterThan(c.y);
      expect(edge.end.y).toBeLessThan(c.y + c.h);
    }
    expect(edges[0]!.end.y).not.toBe(edges[1]!.end.y);
  });

  it('skips links to cards that are not on the board, and lays out nothing as nothing', () => {
    expect(layoutCards([node('a')], [link('a', 'gone')]).edges).toEqual([]);
    expect(layoutCards([], [])).toMatchObject({ width: 0, height: 0 });
  });
});
