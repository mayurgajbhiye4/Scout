import { describe, expect, it } from 'vitest';
import {
  answerStage,
  applyResearchEvent,
  pastLabel,
  traceSummary,
  traceToActivity,
  type ResearchActivityItem,
  type ResearchProgressEvent,
} from '../copilot/researchProgress';

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

describe('saved research trace', () => {
  const trace = {
    searches: [
      { source: 'library', query: 'attention cost', found: 0 },
      { source: 'web', query: 'attention quadratic cost', found: 5 },
    ],
    retries: 1,
    verdict: { sufficient: true, reason: 'The web results cover it' },
  };

  it('replays the searches, the verdict and the write-up as finished steps', () => {
    const items = traceToActivity(trace);
    expect(items.map((i) => i.label)).toEqual([
      'Searched your library and knowledge graph',
      'Searched the web',
      'Evidence was sufficient',
      'Wrote the answer',
    ]);
    expect(items[0]).toMatchObject({ state: 'warn', detail: 'nothing relevant' });
    expect(items[1]?.detail).toBe('“attention quadratic cost” · 5 pages');
    expect(items.some((i) => i.state === 'active')).toBe(false);
  });

  it('shows nothing for an answer without searches', () => {
    expect(traceToActivity(null)).toEqual([]);
    expect(traceToActivity({ searches: [] })).toEqual([]);
  });

  it('sums the searches into one line', () => {
    expect(traceSummary(trace)).toBe('Searched library and web twice · 5 results');
    expect(traceSummary({ searches: [{ source: 'library', query: 'q', found: 1 }] })).toBe('Searched your library once · 1 result');
  });

  it('words a finished live step in the past tense', () => {
    const items = run([librarySearch, found(3)]);
    expect(pastLabel(items[0]!)).toBe('Searched your library and knowledge graph');
    expect(pastLabel(run([librarySearch])[0]!)).toBe('Searching your library and knowledge graph');
  });
});

describe('answer pipeline stage', () => {
  const evaluate: ResearchProgressEvent = { status: 'step', stage: 'evaluate' };
  const insufficient: ResearchProgressEvent = {
    status: 'evidence',
    sufficient: false,
    retry: { source: 'library', query: 'q', attempt: 1, max_attempts: 2 },
  };

  it('starts at retrieval before any step arrives', () => {
    expect(answerStage([], false)).toBe(0);
  });

  it('follows the agent from retrieval to grading and back again on a retry', () => {
    expect(answerStage(run([librarySearch, found(2)]), false)).toBe(0);
    expect(answerStage(run([librarySearch, found(2), evaluate]), false)).toBe(1);
    expect(answerStage(run([librarySearch, found(2), evaluate, insufficient]), false)).toBe(1);
    expect(answerStage(run([librarySearch, found(2), evaluate, insufficient, librarySearch]), false)).toBe(0);
  });

  it('is at the answer once writing starts or the reply streams', () => {
    expect(answerStage(run([librarySearch, found(2), { status: 'step', stage: 'generate' }]), false)).toBe(2);
    expect(answerStage(run([librarySearch]), true)).toBe(2);
  });
});
