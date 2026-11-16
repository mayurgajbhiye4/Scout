import { describe, it, expect } from 'vitest';
import { MAX_TABS, neighbourAfterClose, parseTabs, withTab, withoutTab } from '../openTabs';

const a = { id: 'a', title: 'Alpha' };
const b = { id: 'b', title: 'Beta' };
const c = { id: 'c', title: 'Gamma' };

describe('parseTabs', () => {
  it('reads saved tabs in order', () => {
    expect(parseTabs(JSON.stringify([a, b]))).toEqual([a, b]);
  });

  it('gives no tabs for nothing, junk, or something that is not a list', () => {
    expect(parseTabs(null)).toEqual([]);
    expect(parseTabs('{not json')).toEqual([]);
    expect(parseTabs('{"id":"a"}')).toEqual([]);
  });

  it('drops malformed and repeated entries, and fills in a missing title', () => {
    const saved = JSON.stringify([a, null, 'x', { title: 'no id' }, { id: '' }, a, { id: 'd', title: 4 }]);
    expect(parseTabs(saved)).toEqual([a, { id: 'd', title: '' }]);
  });

  it('keeps only the newest when more were saved than fit', () => {
    const many = Array.from({ length: MAX_TABS + 3 }, (_, i) => ({ id: `s${i}`, title: '' }));
    const tabs = parseTabs(JSON.stringify(many));
    expect(tabs).toHaveLength(MAX_TABS);
    expect(tabs[0]?.id).toBe('s3');
  });
});

describe('withTab', () => {
  it('adds a new tab at the end', () => {
    expect(withTab([a], b)).toEqual([a, b]);
  });

  it('returns the same array when the tab is already there unchanged', () => {
    const tabs = [a, b];
    expect(withTab(tabs, { ...a })).toBe(tabs);
  });

  it('brings a title up to date, in place', () => {
    expect(withTab([a, b], { id: 'a', title: 'Renamed' })).toEqual([{ id: 'a', title: 'Renamed' }, b]);
  });

  it('never replaces a known title with an unknown one', () => {
    const tabs = [a];
    expect(withTab(tabs, { id: 'a', title: '' })).toBe(tabs);
  });

  it('drops the oldest tab once there are too many', () => {
    expect(withTab([a, b], c, 2)).toEqual([b, c]);
  });
});

describe('withoutTab', () => {
  it('removes the tab', () => {
    expect(withoutTab([a, b, c], 'b')).toEqual([a, c]);
  });

  it('returns the same array when the tab was not open', () => {
    const tabs = [a];
    expect(withoutTab(tabs, 'zz')).toBe(tabs);
  });
});

describe('neighbourAfterClose', () => {
  it('goes to the tab on the right', () => {
    expect(neighbourAfterClose([a, b, c], 'b')).toBe(c);
  });

  it('goes left when the last tab closes', () => {
    expect(neighbourAfterClose([a, b, c], 'c')).toBe(b);
  });

  it('goes nowhere when it was the only tab, or was not open', () => {
    expect(neighbourAfterClose([a], 'a')).toBeNull();
    expect(neighbourAfterClose([a], 'zz')).toBeNull();
  });
});
