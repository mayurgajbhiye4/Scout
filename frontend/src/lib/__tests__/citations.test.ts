import { describe, it, expect } from 'vitest';
import { REFERENCES_MARKER, resolveReferencedSources, splitReferences, summarizeGrounding } from '../citations';

describe('research citations', () => {
  const citations = [
    { citation_index: 1, source_id: 'lib-1', source_title: 'RAG paper.pdf', source_type: 'pdf', retrieved_via: 'graph', matched_entities: ['Attention'] },
    { citation_index: 2, source_id: null, source_title: 'Knowledge graph: Attention', source_type: 'graph' },
    { citation_index: 4, source_id: null, source_title: 'New RAG survey', source_type: 'web', canonical_uri: 'https://example.org/survey' },
    { citation_index: 5, source_id: 'lib-2', source_title: 'Saved blog post', source_type: 'web', canonical_uri: 'https://blog.dev/post' },
  ];

  it('keeps the numbers used in the answer text', () => {
    const refs = resolveReferencedSources(citations, 'Grounded [1], linked [2], recent work [4], blog [5].');
    expect(refs.map((r) => r.displayIndex)).toEqual([1, 2, 4, 5]);
  });

  it('classifies origin: library, graph, web (a saved web page stays library)', () => {
    const refs = resolveReferencedSources(citations, '[1] [2] [4] [5]');
    expect(refs.map((r) => r.origin)).toEqual(['library', 'graph', 'web', 'library']);
    expect(refs[0]!.matchedEntities).toEqual(['Attention']);
    expect(refs[3]!.sourceType).toBe('document');
  });

  it('reads origin data from stored citation locators', () => {
    const stored = [{ citation_index: 3, source_id: null, locator: { source_title: 'Web page', source_type: 'web', canonical_uri: 'https://x.dev' } }];
    const [ref] = resolveReferencedSources(stored, 'see [3]');
    expect(ref!.origin).toBe('web');
    expect(ref!.url).toBe('https://x.dev');
    expect(ref!.displayIndex).toBe(3);
  });

  it('summarizes grounding', () => {
    const refs = resolveReferencedSources(citations, '[1] [2] [4] [5]');
    expect(summarizeGrounding(refs)).toBe('2 library sources · knowledge graph · 1 web result');
    expect(summarizeGrounding([])).toBe('');
  });

  it('splits the appended reference list from the answer', () => {
    const content = `Answer body [1].${REFERENCES_MARKER}- **[1]** [Paper](https://p.dev) — Web · p.dev`;
    expect(splitReferences(content)).toEqual({
      body: 'Answer body [1].',
      references: '- **[1]** [Paper](https://p.dev) — Web · p.dev',
    });
    expect(splitReferences('No references here')).toEqual({ body: 'No references here', references: '' });
  });
});
