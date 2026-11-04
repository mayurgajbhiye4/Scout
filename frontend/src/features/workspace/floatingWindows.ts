/** 'sessions' is the left-hand window, which shows sessions or sources (one at a time); 'copilot' sits on the right. */
export type WindowId = 'sessions' | 'copilot';

export const WINDOW_IDS: readonly WindowId[] = ['sessions', 'copilot'];

/** What the left-hand window is showing. */
export type LeftPanelTab = 'sessions' | 'sources';
export const LEFT_PANEL_TABS: readonly LeftPanelTab[] = ['sessions', 'sources'];

/**
 * The windows that show over the knowledge map, given the ones the user has open in the order they opened them. With
 * room for all, that is every open one. Otherwise the sessions/sources window on the left and the copilot on the right
 * don't both fit beside the map, so whichever was opened last shows.
 */
export function visibleWindows(open: readonly WindowId[], roomForAll: boolean): WindowId[] {
  if (roomForAll || open.length === 0) return [...open];
  return open[open.length - 1] === 'sessions' ? ['sessions'] : open.filter((w) => w !== 'sessions');
}

/** Open windows as saved by the browser, oldest first; anything unreadable gives `fallback`. */
export function parseOpenWindows(saved: string | null, fallback: WindowId[]): WindowId[] {
  if (!saved) return fallback;
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return fallback;
    const ids = value.filter((v): v is WindowId => typeof v === 'string' && (WINDOW_IDS as readonly string[]).includes(v));
    return [...new Set(ids)];
  } catch {
    return fallback;
  }
}
