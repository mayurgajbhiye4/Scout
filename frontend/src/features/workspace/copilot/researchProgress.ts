/**
 * Live research activity for the reply being generated: each search (library or web), the evidence check,
 * and any retry with a rewritten query / switched source. Built from the chat stream's progress events.
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
  retry?: { source: string; query: string; attempt: number; max_attempts: number };
}

const asSource = (value?: string): SearchSource => (value === 'web' ? 'web' : 'library');

export const sourceName = (source: string) => (source === 'web' ? 'the web' : 'your library');

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

export function applyResearchEvent(items: ResearchActivityItem[], event: ResearchProgressEvent): ResearchActivityItem[] {
  if (event.status === 'step') {
    if (event.stage === 'retrieve' || event.stage === 'web_search') {
      const source = asSource(event.source);
      const isRetry = Boolean(event.query);
      const label =
        source === 'web'
          ? isRetry ? 'Searching the web with a rewritten query' : 'Searching the web'
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
    // No verdict means the check was skipped (small talk, or no retries left): drop the row
    if (event.sufficient === null || event.sufficient === undefined) return updateLast(items, 'check', () => null);
    const checked = updateLast(items, 'check', (item) => ({
      ...item,
      label: event.sufficient ? 'Evidence is sufficient' : 'Evidence is insufficient',
      detail: event.reason || undefined,
      state: event.sufficient ? 'done' : 'warn',
    }));
    if (!event.retry) return checked;

    const lastSearch = [...items].reverse().find((i) => i.kind === 'search');
    const target = asSource(event.retry.source);
    const switching = lastSearch?.source !== target;
    return [
      ...checked,
      {
        id: nextId++,
        kind: 'retry',
        source: target,
        label: switching ? `Switching to ${sourceName(target)}` : `Retrying ${sourceName(target)}`,
        detail: `Rewrote the query · retry ${event.retry.attempt} of ${event.retry.max_attempts}`,
        state: 'done',
      },
    ];
  }

  return items;
}
