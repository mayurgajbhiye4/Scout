import type { CSSProperties } from 'react';

/** Delay for one element of a `.ui-in-*` intro (styles/global.css), so contents arrive in reading order. */
export const introDelay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

// A list arrives 40ms an item and never waits longer than 400ms, however long the list is
const STAGGER_STEP_MS = 40;
const STAGGER_MAX_MS = 400;

/** `introDelay` for the item at `index` in a list, after the list's own `startMs`. */
export const staggerDelay = (index: number, startMs = 0) =>
  introDelay(startMs + Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS));
