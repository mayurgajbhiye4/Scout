/**
 * Live research activity for the reply being generated: each search (library or web), the evidence check
 * (with any off-topic sources it set aside), the search it picked next, and the web fallback. Built from the
 * chat stream's progress events.
 */

import type { ResearchTrace } from '@/api/chat';

export type SearchSource = 'library' | 'web';
export type ActivityState = 'active' | 'done' | 'warn';

export interface ResearchActivityItem {
  id: number;
  kind: 'search' | 'check' | 'retry' | 'write';
  source?: SearchSource;
  label: string;
  detail?: string;
  state: ActivityState;
}

/** The progress fields of one chat stream event. */
export interface ResearchProgressEvent {
  status?: string;
  stage?: string;
  source?: string;
  query?: string;
  found?: number;
  sufficient?: boolean | null;
  reason?: string;
  /** Off-topic sources the evidence check set aside */
  dropped?: number;
  /** The queries of the search the evidence check planned next */
  queries?: string[];
  retry?: { source: string; query: string; attempt: number; max_attempts: number };
}

const RETRY_LABEL: Record<SearchSource, string> = {
  library: 'Retrying your library',
  web: 'Searching the web instead',
};

function checkDetail(event: ResearchProgressEvent): string | undefined {
  const dropped = event.dropped
    ? `set aside ${event.dropped} off-topic source${event.dropped === 1 ? '' : 's'}`
    : '';
  return [event.reason, dropped].filter(Boolean).join(' · ') || undefined;
}

const asSource = (value?: string): SearchSource => (value === 'web' ? 'web' : 'library');

export function foundLabel(source: string, found?: number): string {
  if (found === undefined) return '';
  if (found === 0) return 'nothing relevant';
  if (source === 'web') return `${found} page${found === 1 ? '' : 's'}`;
  return `${found} relevant passage${found === 1 ? '' : 's'}`;
}

let nextId = 0;

/** Marks whatever is still running as finished before a new stage starts. */
const settle = (items: ResearchActivityItem[]) =>
  items.map((item) => (item.state === 'active' ? { ...item, state: 'done' as const } : item));

const updateLast = (
  items: ResearchActivityItem[],
  kind: ResearchActivityItem['kind'],
  update: (item: ResearchActivityItem) => ResearchActivityItem | null
) => {
  const index = items.map((i) => i.kind).lastIndexOf(kind);
  const target = items[index];
  if (!target) return items;
  const updated = update(target);
  return updated ? items.map((item, i) => (i === index ? updated : item)) : items.filter((_, i) => i !== index);
};

/** A web search that carries a query follows the library retry: it either replaces the library or adds to it. */
function webFallbackLabel(items: ResearchActivityItem[]): string {
  const lastLibrarySearch = [...items].reverse().find((i) => i.kind === 'search' && i.source === 'library');
  return lastLibrarySearch?.state === 'warn' ? 'Nothing in your library, searching the web' : 'Topping up from the web';
}

export function applyResearchEvent(items: ResearchActivityItem[], event: ResearchProgressEvent): ResearchActivityItem[] {
  if (event.status === 'step') {
    if (event.stage === 'retrieve' || event.stage === 'web_search') {
      const source = asSource(event.source);
      const isRetry = Boolean(event.query);
      const label =
        source === 'web'
          ? isRetry ? webFallbackLabel(items) : 'Searching the web'
          : isRetry ? 'Searching your library again' : 'Searching your library and knowledge graph';
      return [
        ...settle(items),
        { id: nextId++, kind: 'search', source, label, detail: isRetry ? `“${event.query}”` : undefined, state: 'active' },
      ];
    }
    if (event.stage === 'evaluate') {
      return [...settle(items), { id: nextId++, kind: 'check', label: 'Checking the evidence', state: 'active' }];
    }
    if (event.stage === 'generate') {
      return [...settle(items), { id: nextId++, kind: 'write', label: 'Writing the answer', state: 'active' }];
    }
    return items;
  }

  if (event.status === 'search') {
    return updateLast(items, 'search', (item) => {
      const found = foundLabel(item.source ?? 'library', event.found);
      return {
        ...item,
        detail: [item.detail, found].filter(Boolean).join(' · ') || undefined,
        state: event.found === 0 ? 'warn' : 'done',
      };
    });
  }

  if (event.status === 'evidence') {
    // No verdict means nothing was graded (small talk, a library hit, or the web fallback): drop the row
    if (event.sufficient === null || event.sufficient === undefined) return updateLast(items, 'check', () => null);
    const checked = updateLast(items, 'check', (item) => ({
      ...item,
      label: event.sufficient ? 'Evidence is sufficient' : 'Evidence is insufficient',
      detail: checkDetail(event),
      state: event.sufficient ? 'done' : 'warn',
    }));
    if (!event.retry) return checked;

    const source = asSource(event.retry.source);
    const queryCount = event.queries?.length ?? 1;
    return [
      ...checked,
      {
        id: nextId++,
        kind: 'retry',
        source,
        label: RETRY_LABEL[source],
        detail: queryCount > 1 ? `Split into ${queryCount} queries` : 'Rewrote the query',
        state: 'done',
      },
    ];
  }

  return items;
}

/**
 * Where a reply being generated is in the answer half of the pipeline: 0 retrieval, 1 the corrective agent,
 * 2 the cited answer. A retry sends it back to retrieval, which the pipeline draws as its loop.
 */
export function answerStage(items: ResearchActivityItem[], streaming: boolean): 0 | 1 | 2 {
  const last = items.at(-1);
  if (streaming || last?.kind === 'write') return 2;
  if (last?.kind === 'check' || last?.kind === 'retry') return 1;
  return 0;
}

/** Past-tense wording for a finished step, so a settled timeline reads as a record rather than live progress. */
const PAST_LABEL: Record<string, string> = {
  'Searching your library and knowledge graph': 'Searched your library and knowledge graph',
  'Searching your library again': 'Searched your library again',
  'Searching the web': 'Searched the web',
  'Nothing in your library, searching the web': 'Nothing in your library, searched the web',
  'Topping up from the web': 'Topped up from the web',
  'Checking the evidence': 'Checked the evidence',
  'Writing the answer': 'Wrote the answer',
  'Retrying your library': 'Retried your library',
  'Searching the web instead': 'Searched the web instead',
};

export function pastLabel(item: ResearchActivityItem): string {
  return item.state === 'active' ? item.label : PAST_LABEL[item.label] ?? item.label;
}

/** The research trace saved with a finished answer, as the same steps the live timeline showed. */
export function traceToActivity(trace: ResearchTrace | null | undefined): ResearchActivityItem[] {
  if (!trace?.searches.length) return [];
  const items: ResearchActivityItem[] = trace.searches.map((search, i) => {
    const source = asSource(search.source);
    const earlierLibrary = trace.searches.slice(0, i).some((s) => s.source !== 'web');
    const label =
      source === 'web' ? 'Searched the web' : earlierLibrary ? 'Searched your library again' : 'Searched your library and knowledge graph';
    const found = foundLabel(source, search.found);
    return {
      id: i,
      kind: 'search',
      source,
      label,
      detail: [i > 0 && search.query ? `“${search.query}”` : '', found].filter(Boolean).join(' · ') || undefined,
      state: search.found === 0 ? 'warn' : 'done',
    };
  });
  if (trace.verdict) {
    items.push({
      id: items.length,
      kind: 'check',
      label: trace.verdict.sufficient ? 'Evidence was sufficient' : 'Evidence fell short',
      detail: trace.verdict.reason || undefined,
      state: trace.verdict.sufficient ? 'done' : 'warn',
    });
  }
  items.push({ id: items.length, kind: 'write', label: 'Wrote the answer', state: 'done' });
  return items;
}

/** One line for a collapsed timeline, e.g. "Searched twice · 9 results". */
export function traceSummary(trace: ResearchTrace | null | undefined): string {
  const searches = trace?.searches ?? [];
  if (searches.length === 0) return 'Research steps';
  const times = searches.length === 1 ? 'once' : searches.length === 2 ? 'twice' : `${searches.length} times`;
  const results = searches.reduce((sum, s) => sum + (s.found ?? 0), 0);
  const where = searches.some((s) => s.source === 'web') ? (searches.some((s) => s.source !== 'web') ? 'library and web' : 'the web') : 'your library';
  return `Searched ${where} ${times} · ${results} result${results === 1 ? '' : 's'}`;
}
