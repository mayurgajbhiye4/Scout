import { useEffect, useRef, useState, type RefObject } from 'react';

export interface PanelBounds {
  defaultWidth: number;
  min: number;
  max: number;
}

/** Sources and copilot windows: readable chat line length at the default, room for tables when widened. */
export const SIDE_COLUMN_BOUNDS: PanelBounds = { defaultWidth: 400, min: 320, max: 620 };
/** The map always keeps at least this much width clear beside the floating windows. */
export const GRAPH_MIN_WIDTH = 360;

export function clampWidth(width: number, min: number, max: number): number {
  // When the window is too small for both bounds, the minimum wins
  return Math.max(min, Math.min(width, Math.max(min, max)));
}

/** A panel width the user can drag, remembered per browser. */
export function usePanelWidth(storageKey: string, bounds: PanelBounds) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) return clampWidth(saved, bounds.min, bounds.max);
    } catch {
      // storage unavailable; use the default
    }
    return bounds.defaultWidth;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {
      // storage unavailable; the width just won't persist
    }
  }, [storageKey, width]);

  return [width, setWidth] as const;
}

/** Live width of an element (0 until it mounts). */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
