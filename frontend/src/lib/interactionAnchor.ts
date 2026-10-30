/**
 * Remembers the control the person last pressed or submitted from, so feedback about the request it started (a rate
 * limit, say) can appear next to it instead of in the middle of the screen.
 */

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
}

export interface InteractionAnchor {
  element: Element;
  /** Where the element was when it was used, for when it has since closed (a popover's submit button). */
  rect: AnchorRect;
}

// A response that arrives later than this was most likely not started by the last thing the person touched
const RECENT_MS = 8000;

const CONTROL_SELECTOR = 'button, a, input, textarea, select, [role="button"], [role="option"], [role="tab"]';

let last: (InteractionAnchor & { at: number }) | null = null;

function toRect(r: DOMRect): AnchorRect {
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
}

function record(event: Event) {
  if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const element = target.closest(CONTROL_SELECTOR) ?? target;
  last = { element, rect: toRect(element.getBoundingClientRect()), at: Date.now() };
}

/** Starts listening; returns the cleanup. Capture phase, so handlers that stop propagation don't hide presses. */
export function trackInteractions(): () => void {
  window.addEventListener('pointerdown', record, true);
  window.addEventListener('keydown', record, true);
  return () => {
    window.removeEventListener('pointerdown', record, true);
    window.removeEventListener('keydown', record, true);
  };
}

/** The control used in the last few seconds, or null when nothing was (a background refetch). */
export function recentInteraction(): InteractionAnchor | null {
  if (!last || Date.now() - last.at > RECENT_MS) return null;
  return { element: last.element, rect: last.rect };
}

/** Where the anchor is now: live while the element is still on screen, else where it was when used. */
export function currentAnchorRect(anchor: InteractionAnchor): AnchorRect {
  if (anchor.element.isConnected) {
    const live = anchor.element.getBoundingClientRect();
    if (live.width > 0 || live.height > 0) return toRect(live);
  }
  return anchor.rect;
}
