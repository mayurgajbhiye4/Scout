import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import ResizeHandle from '../ResizeHandle';
import { CHAT_BOUNDS, clampWidth, usePanelWidth } from '../usePanelWidth';

beforeAll(() => {
  // jsdom has no PointerEvent, so pointer events would lose button/clientX; back it with MouseEvent
  if (!window.PointerEvent) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
  // jsdom doesn't implement pointer capture
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

function renderHandle(props: Partial<Parameters<typeof ResizeHandle>[0]> = {}) {
  const onResize = vi.fn();
  render(
    <ResizeHandle
      label="Resize chat panel"
      panel="after"
      width={440}
      min={340}
      max={760}
      defaultWidth={440}
      onResize={onResize}
      {...props}
    />
  );
  return { onResize, handle: screen.getByRole('separator', { name: 'Resize chat panel' }) };
}

describe('ResizeHandle', () => {
  it('exposes an accessible vertical separator with its range', () => {
    const { handle } = renderHandle();
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '440');
    expect(handle).toHaveAttribute('aria-valuemin', '340');
    expect(handle).toHaveAttribute('aria-valuemax', '760');
  });

  it('grows a right-hand panel when dragged left, clamped to its max', () => {
    const { onResize, handle } = renderHandle({ panel: 'after' });
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(540);
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(760);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(document.body.style.cursor).toBe('');
  });

  it('grows a left-hand panel when dragged right, clamped to its min', () => {
    const { onResize, handle } = renderHandle({ panel: 'before', width: 360, min: 260, max: 560 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 360, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(400);
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(260);
  });

  it('ignores pointer moves without a drag', () => {
    const { onResize, handle } = renderHandle();
    fireEvent.pointerMove(handle, { clientX: 10 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('supports keyboard resizing and reset', () => {
    const { onResize, handle } = renderHandle({ panel: 'after' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(456);
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(onResize).toHaveBeenLastCalledWith(376);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(760);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(340);
    fireEvent.doubleClick(handle);
    expect(onResize).toHaveBeenLastCalledWith(440);
  });
});

describe('panel widths', () => {
  beforeEach(() => localStorage.clear());

  it('clamps, with the minimum winning when space runs out', () => {
    expect(clampWidth(900, 340, 760)).toBe(760);
    expect(clampWidth(100, 340, 760)).toBe(340);
    expect(clampWidth(500, 340, 200)).toBe(340);
  });

  it('remembers the width per browser and clamps stored values', () => {
    const { result, unmount } = renderHook(() => usePanelWidth('test_width', CHAT_BOUNDS));
    expect(result.current[0]).toBe(CHAT_BOUNDS.defaultWidth);
    act(() => result.current[1](600));
    expect(localStorage.getItem('test_width')).toBe('600');
    unmount();

    localStorage.setItem('test_width', '5000');
    const { result: restored } = renderHook(() => usePanelWidth('test_width', CHAT_BOUNDS));
    expect(restored.current[0]).toBe(CHAT_BOUNDS.max);
  });
});
