import { describe, it, expect } from 'vitest';
import type { KnowledgeGraphData } from '@/api/knowledge';
import { deriveWorkspaceGraph } from '../useWorkspaceData';
import {
  ALL_RELATIONS,
  SHARED_VIEW,
  buildView,
  countRelations,
  countShared,
  groupEntities,
  nextCompare,
  prettyRelation,
  relationColor,
  scopeGraph,
} from '../canvas/graphView';
import { GROUP_ORDER, groupOf } from '../canvas/entityTypes';

const RAW: KnowledgeGraphData = {
  nodes: [
    { id: 'me', label: 'You', type: 'User' },
    { id: 'doc1', label: 'Paper', type: 'Document' },
    { id: 'doc2', label: 'Video', type: 'Document' },
    { id: 'lc', label: 'LangChain', type: 'Technology', description: 'A framework for LLM apps.' },
    { id: 'gem', label: 'Gemini', type: 'Technology', description: '  ' },
    { id: 'rag', label: 'RAG', type: 'Concept' },
    { id: 'orphan', label: 'Old query', type: 'Concept' },
    { id: 'doc3', label: 'Unread notes', type: 'Document' },
  ],
  edges: [
    { source: 'doc1', target: 'me', relationship: 'EXTRACTED_FROM' },
    { source: 'doc2', target: 'me', relationship: 'EXTRACTED_FROM' },
    { source: 'doc1', target: 'lc', relationship: 'MENTIONS' },
    { source: 'doc1', target: 'gem', relationship: 'MENTIONS' },
    { source: 'doc2', target: 'lc', relationship: 'MENTIONS' },
    { source: 'doc2', target: 'rag', relationship: 'MENTIONS' },
    { source: 'lc', target: 'gem', relationship: 'USES', description: 'Ships a Gemini chat model.' },
    { source: 'lc', target: 'gem', relationship: 'INTEGRATES_WITH' },
    { source: 'lc', target: 'gem', relationship: 'USES' }, // duplicate
    { source: 'rag', target: 'lc', relationship: 'APPLIED_TO' },
    { source: 'me', target: 'rag', relationship: 'CURIOUS_ABOUT' },
    { source: 'me', target: 'orphan', relationship: 'EXPLORED' },
    { source: 'lc', target: 'missing', relationship: 'USES' },
  ],
};

const graph = deriveWorkspaceGraph(RAW);
const ids = (nodes: Array<{ id: string }>) => nodes.map((n) => n.id).sort();

describe('deriveWorkspaceGraph', () => {
  it('keeps different relations between the same pair, drops exact duplicates and dangling edges', () => {
    const lcToGem = graph.links.filter((l) => l.source === 'lc' && l.target === 'gem').map((l) => l.relationship);
    expect(lcToGem).toEqual(['USES', 'INTEGRATES_WITH']);
    expect(graph.links.some((l) => l.target === 'missing')).toBe(false);
  });

  it('keeps descriptions, treating blank ones as missing', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get('lc')!.description).toBe('A framework for LLM apps.');
    expect(byId.get('gem')!.description).toBeUndefined();
    expect(graph.links.find((l) => l.relationship === 'USES')!.description).toBe('Ships a Gemini chat model.');
  });

  it('indexes sources and neighbours from knowledge edges only, never through you', () => {
    expect([...graph.entitiesBySource.get('doc1')!].sort()).toEqual(['gem', 'lc']);
    expect(graph.entitiesBySource.has('me')).toBe(false);
    expect(graph.neighbors.has('me')).toBe(false);
    expect([...graph.neighbors.get('rag')!].sort()).toEqual(['doc2', 'lc']);
    expect(graph.nodes.find((n) => n.id === 'orphan')!.degree).toBe(0);
    expect(graph.nodes.find((n) => n.id === 'me')!.isUser).toBe(true);
  });
});

describe('several sources on the map', () => {
  const both = new Set(['doc1', 'doc2']);

  it('counts a concept as shared only among the sources in scope', () => {
    // LangChain is in both documents, but the library knowing that doesn't make it shared within one of them
    expect(countShared(scopeGraph(graph, both).nodes, both)).toBe(1);
    const one = new Set(['doc1']);
    expect(countShared(scopeGraph(graph, one).nodes, one)).toBe(0);
  });

  it('the Shared view keeps the shared concepts, the sources touching them, and solid unlabelled mentions', () => {
    const view = buildView(scopeGraph(graph, both), SHARED_VIEW, both);
    expect(ids(view.nodes)).toEqual(['doc1', 'doc2', 'lc']);
    expect(view.links).toHaveLength(2);
    expect(view.links.every((l) => l.relationship === 'MENTIONS' && l.quiet && l.bridge)).toBe(true);
  });

  it('builds a comparison up from the selection and collapses it back down', () => {
    const none = new Set<string>();
    expect(nextCompare(none, null, 'a')).toEqual({ compared: none, selected: 'a' });

    const pair = nextCompare(none, 'a', 'b');
    expect([...pair.compared].sort()).toEqual(['a', 'b']);
    expect(pair.selected).toBeNull();

    const three = nextCompare(pair.compared, null, 'c');
    expect(three.compared.size).toBe(3);

    expect(nextCompare(pair.compared, null, 'b')).toEqual({ compared: none, selected: 'a' });
    expect(nextCompare(none, 'a', 'a')).toEqual({ compared: none, selected: null });
  });
});

describe('scopeGraph', () => {
  it('a source keeps its concepts, its mentions and the relations among them', () => {
    const s = scopeGraph(graph, new Set(['doc1']));
    expect(ids(s.nodes)).toEqual(['doc1', 'gem', 'lc']);
    expect(s.links.map((l) => l.relationship).sort()).toEqual(['INTEGRATES_WITH', 'MENTIONS', 'MENTIONS', 'USES']);
  });

  it('a session unions its sources, and brings you in only through memory edges into it', () => {
    const s = scopeGraph(graph, new Set(['doc1', 'doc2']));
    expect(ids(s.nodes)).toEqual(['doc1', 'doc2', 'gem', 'lc', 'me', 'rag']);
    expect(s.links.some((l) => l.relationship === 'CURIOUS_ABOUT')).toBe(true);
    expect(s.links.some((l) => l.relationship === 'EXPLORED' || l.relationship === 'EXTRACTED_FROM')).toBe(false);
  });

  it('a source without concepts is still in scope, an unmapped one is not', () => {
    expect(ids(scopeGraph(graph, new Set(['doc3'])).nodes)).toEqual(['doc3']);
    expect(scopeGraph(graph, new Set(['not-mapped'])).nodes).toEqual([]);
  });
});

describe('buildView', () => {
  const session = scopeGraph(graph, new Set(['doc1', 'doc2', 'doc3']));

  it("'*' shows the material: mentions as quiet context, relations as arrows, every source, not you", () => {
    const v = buildView(session, ALL_RELATIONS);
    expect(ids(v.nodes)).toEqual(['doc1', 'doc2', 'doc3', 'gem', 'lc', 'rag']);
    expect(v.links).toHaveLength(7);
    expect(v.links.filter((l) => l.quiet).map((l) => l.relationship)).toEqual(['MENTIONS', 'MENTIONS', 'MENTIONS', 'MENTIONS']);
    expect(v.links.find((l) => l.relationship === 'USES')!.quiet).toBeUndefined();
  });

  it('a chip isolates its relation and the nodes it touches', () => {
    const v = buildView(session, 'USES');
    expect(ids(v.nodes)).toEqual(['gem', 'lc']);
    expect(ids(buildView(session, 'CURIOUS_ABOUT').nodes)).toEqual(['me', 'rag']);
    expect(buildView(session, 'MENTIONS').links.some((l) => l.quiet)).toBe(false);
  });
});

describe('countRelations', () => {
  it('orders concept relations first, then MENTIONS, then relations about you, each by count; * counts mentions and relations', () => {
    const { all, types } = countRelations(graph.links);
    expect(all).toBe(7);
    expect(types.map((t) => t.relationship)).toEqual([
      'APPLIED_TO',
      'INTEGRATES_WITH',
      'USES',
      'MENTIONS',
      'EXTRACTED_FROM',
      'CURIOUS_ABOUT',
      'EXPLORED',
    ]);
  });
});

describe('helpers', () => {
  it('prettyRelation reads like words', () => {
    expect(prettyRelation('CREATED_BY')).toBe('created by');
    expect(prettyRelation('IS_A')).toBe('is a');
  });

  it('relationColor is stable, themed, and fixed for structural relations', () => {
    expect(relationColor('USES', true)).toBe(relationColor('USES', true));
    expect(relationColor('USES', true)).not.toBe(relationColor('USES', false));
    expect(relationColor('MENTIONS', false)).toBe('#a1a1aa');
  });

  it('relationColor uses only green, red and white: agreement, opposition, everything else', () => {
    const green = relationColor('SUPPORTS', false);
    const red = relationColor('CONTRADICTS', false);
    const white = relationColor('IS_A', false);
    expect(new Set([green, red, white]).size).toBe(3);
    expect(relationColor('CONTRASTS_WITH', false)).toBe(red);
    expect(relationColor('DISAGREES_WITH', false)).toBe(red);
    expect(relationColor('DISLIKES', false)).toBe(red);
    expect(relationColor('ENABLES', false)).toBe(green);
    expect(relationColor('LIKES', false)).toBe(green);
    for (const rel of ['USES', 'PROPOSED_BY', 'IS_A', 'PART_OF', 'CURIOUS_ABOUT', 'EXPLORED']) {
      expect(relationColor(rel, false)).toBe(white);
    }
  });

});

describe('groupEntities', () => {
  const group = (query: string, groups: Set<string> | null = null) =>
    groupEntities(graph.nodes, query, groups, groupOf, GROUP_ORDER).map((g) => [g.label, g.nodes.map((n) => n.id)]);

  it('groups in the legend order, most connected first, and leaves you out', () => {
    expect(group('')).toEqual([
      ['Source', ['doc1', 'doc2', 'doc3']],
      ['Concept', ['rag', 'orphan']],
      ['Technology', ['lc', 'gem']],
    ]);
  });

  it('matches names and descriptions, ignoring case', () => {
    expect(group('GEM')).toEqual([['Technology', ['gem']]]);
    expect(group('framework')).toEqual([['Technology', ['lc']]]);
    expect(group('nothing like it')).toEqual([]);
  });

  it('keeps only the picked groups', () => {
    expect(group('', new Set(['Source']))).toEqual([['Source', ['doc1', 'doc2', 'doc3']]]);
  });
});
