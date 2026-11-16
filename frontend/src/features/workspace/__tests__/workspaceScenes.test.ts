import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENE_CYCLE_MS, SCENES, useSceneRotation, type WorkspaceActivity } from '../workspaceScenes';

const idle: WorkspaceActivity = { ingestingKeys: [], answering: false };
const answering: WorkspaceActivity = { ingestingKeys: [], answering: true };
const reading: WorkspaceActivity = { ingestingKeys: ['a:0'], answering: false };

function setup(initial: WorkspaceActivity = idle) {
  return renderHook((activity: WorkspaceActivity) => useSceneRotation(activity), { initialProps: initial });
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('workspace scene rotation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts on the meadow and stays put while nothing runs', () => {
    const { result } = setup();
    expect(result.current).toEqual({ index: 0, previous: null });
    wait(SCENE_CYCLE_MS * 3);
    expect(result.current.index).toBe(0);
  });

  it('moves on as an answer starts, keeps cycling while it runs, and stops where it got to', () => {
    const { result, rerender } = setup();
    rerender(answering);
    expect(result.current).toEqual({ index: 1, previous: 0 });
    wait(SCENE_CYCLE_MS);
    expect(result.current).toEqual({ index: 2, previous: 1 });
    wait(SCENE_CYCLE_MS);
    expect(result.current.index).toBe(3);
    rerender(idle);
    wait(SCENE_CYCLE_MS * 3);
    expect(result.current.index).toBe(3);
  });

  it('cycles while sources are read, and a source joining doesn\'t add an extra jump', () => {
    const { result, rerender } = setup();
    rerender(reading);
    expect(result.current.index).toBe(1);
    rerender({ ingestingKeys: ['a:0', 'b:0'], answering: false });
    expect(result.current.index).toBe(1);
    wait(SCENE_CYCLE_MS);
    expect(result.current.index).toBe(2);
    // Reading hands over to answering without a gap: one busy stretch, still on the same beat
    rerender(answering);
    expect(result.current.index).toBe(2);
    rerender(idle);
    expect(result.current.index).toBe(2);
  });

  it('wraps round and remembers where it stopped', () => {
    const { result, rerender, unmount } = setup();
    rerender(answering);
    wait(SCENE_CYCLE_MS * SCENES.length);
    expect(result.current.index).toBe(1);
    rerender(idle);
    unmount();
    expect(setup().result.current.index).toBe(1);
  });

  it('with reduced motion, moves on once per start instead of cycling', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const { result, rerender } = setup();
    rerender(answering);
    wait(SCENE_CYCLE_MS * 3);
    expect(result.current.index).toBe(1);
  });
});
