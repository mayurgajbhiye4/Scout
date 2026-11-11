import { describe, expect, it } from 'vitest';
import { applyResearchEvent, type ResearchActivityItem, type ResearchProgressEvent } from '../copilot/researchProgress';

const run = (events: ResearchProgressEvent[]) =>
  events.reduce<ResearchActivityItem[]>((items, event) => applyResearchEvent(items, event), []);

const librarySearch: ResearchProgressEvent = { status: 'step', stage: 'retrieve', source: 'library' };
const webFallback: ResearchProgressEvent = { status: 'step', stage: 'web_search', source: 'web', query: 'better query' };
const found = (count: number): ResearchProgressEvent => ({ status: 'search', found: count });

describe('research activity', () => {
  it('shows a library retry without talking about switching source', () => {
    const items = run([
      librarySearch,
      found(0),
      { status: 'step', stage: 'evaluate' },
      {
        status: 'evidence',
        sufficient: false,
        reason: 'Nothing relevant',
        retry: { source: 'library', query: 'better query', attempt: 1, max_attempts: 1 },
      },
    ]);
    expect(items.at(-1)).toMatchObject({ kind: 'retry', label: 'Retrying your library', detail: 'Rewrote the query' });
  });

  it('says the library had nothing when the web replaces it', () => {
    expect(run([librarySearch, found(0), webFallback]).at(-1)?.label).toBe('Nothing in your library, searching the web');
  });

  it('says the web is topping up when the library retry found passages', () => {
    expect(run([librarySearch, found(3), webFallback]).at(-1)?.label).toBe('Topping up from the web');
  });

  it('labels a web search the user asked for plainly', () => {
    const forced: ResearchProgressEvent = { status: 'step', stage: 'web_search', source: 'web' };
    expect(run([librarySearch, found(3), forced]).at(-1)?.label).toBe('Searching the web');
  });

  it('shows a web search the evidence check picked, split into several queries', () => {
    const items = run([
      librarySearch,
      found(2),
      { status: 'step', stage: 'evaluate' },
      {
        status: 'evidence',
        sufficient: false,
        reason: 'Needs recent results',
        queries: ['part one', 'part two'],
        retry: { source: 'web', query: 'part one', attempt: 1, max_attempts: 2 },
      },
    ]);
    expect(items.at(-1)).toMatchObject({
      kind: 'retry',
      source: 'web',
      label: 'Searching the web instead',
      detail: 'Split into 2 queries',
    });
  });

  it('notes the off-topic sources the check set aside', () => {
    const items = run([
      librarySearch,
      found(3),
      { status: 'step', stage: 'evaluate' },
      { status: 'evidence', sufficient: true, reason: 'Answers it', dropped: 2 },
    ]);
    expect(items.at(-1)).toMatchObject({
      kind: 'check',
      label: 'Evidence is sufficient',
      detail: 'Answers it · set aside 2 off-topic sources',
    });
  });

  it('drops the check row when nothing was graded', () => {
    const items = run([librarySearch, found(3), { status: 'step', stage: 'evaluate' }, { status: 'evidence', sufficient: null }]);
    expect(items.map((i) => i.kind)).toEqual(['search']);
  });
});
