/** A session kept open as a tab in the top bar. The title is as the server gave it; '' until it's known. */
export interface SessionTab {
  id: string;
  title: string;
}

/** More than this and the oldest tab gives way to the new one. */
export const MAX_TABS = 12;

/** Open tabs as saved by the browser, in order; anything unreadable is left out. */
export function parseTabs(saved: string | null): SessionTab[] {
  if (!saved) return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const tabs: SessionTab[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const { id, title } = item as { id?: unknown; title?: unknown };
      if (typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      tabs.push({ id, title: typeof title === 'string' ? title : '' });
    }
    return tabs.slice(-MAX_TABS);
  } catch {
    return [];
  }
}

/**
 * The tabs with `tab` among them: added at the end if it's new, its title brought up to date if it isn't. A title that
 * isn't known yet ('') never replaces one that is. Returns the same array when nothing changes.
 */
export function withTab(tabs: SessionTab[], tab: SessionTab, max = MAX_TABS): SessionTab[] {
  const existing = tabs.find((t) => t.id === tab.id);
  if (existing) {
    if (!tab.title || existing.title === tab.title) return tabs;
    return tabs.map((t) => (t.id === tab.id ? { ...t, title: tab.title } : t));
  }
  const next = [...tabs, tab];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** The tabs without the one for `id`. Returns the same array when it wasn't among them. */
export function withoutTab(tabs: SessionTab[], id: string): SessionTab[] {
  return tabs.some((t) => t.id === id) ? tabs.filter((t) => t.id !== id) : tabs;
}

/** Where closing the tab for `id` leaves you: the tab to its right, else the one to its left, else nowhere. */
export function neighbourAfterClose(tabs: SessionTab[], id: string): SessionTab | null {
  const index = tabs.findIndex((t) => t.id === id);
  if (index === -1) return null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}
