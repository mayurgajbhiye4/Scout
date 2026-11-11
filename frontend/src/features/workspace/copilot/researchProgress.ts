/**
 * Live research activity for the reply being generated: each search (library or web), the evidence check
 * (with any off-topic sources it set aside), the search it picked next, and the web fallback. Built from the
 * chat stream's progress events.
 */

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
