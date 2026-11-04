import { describe, it, expect } from 'vitest';
import { parseOpenWindows, visibleWindows } from '../floatingWindows';

describe('visibleWindows', () => {
  it('shows every open window when there is room for all', () => {
    expect(visibleWindows(['copilot', 'sessions'], true)).toEqual(['copilot', 'sessions']);
  });

  it('shows the side opened last when the left window and the copilot do not both fit', () => {
    expect(visibleWindows(['copilot', 'sessions'], false)).toEqual(['sessions']);
    expect(visibleWindows(['sessions', 'copilot'], false)).toEqual(['copilot']);
    expect(visibleWindows([], false)).toEqual([]);
  });
});

describe('parseOpenWindows', () => {
  it('keeps known windows in order, once each, and falls back on anything unreadable', () => {
    // 'sources' was its own window before it moved into the left one
    expect(parseOpenWindows('["sessions","sources","bogus","copilot","sessions"]', ['copilot'])).toEqual(['sessions', 'copilot']);
    expect(parseOpenWindows('[]', ['copilot'])).toEqual([]);
    expect(parseOpenWindows(null, ['copilot'])).toEqual(['copilot']);
    expect(parseOpenWindows('{"a":1}', ['copilot'])).toEqual(['copilot']);
    expect(parseOpenWindows('not json', ['copilot'])).toEqual(['copilot']);
  });
});
