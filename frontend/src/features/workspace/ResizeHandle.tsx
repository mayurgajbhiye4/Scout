import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { clampWidth } from './usePanelWidth';

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

interface ResizeHandleProps {
  /** Accessible name, e.g. "Resize sources panel". */
  label: string;
  /**
   * Where the resized panel sits relative to the handle: 'before' means the panel is to the left
   * (dragging right grows it), 'after' means it is to the right (dragging left grows it).
   */
  panel: 'before' | 'after';
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  onResize: (width: number) => void;
  onResizingChange?: (resizing: boolean) => void;
  className?: string;
}

/**
 * Vertical splitter between two panels. Drag with mouse/touch/pen; with the keyboard, arrow keys nudge
 * (Shift for bigger steps), Home/End jump to the limits, and Enter or a double-click restores the default.
 */
export default function ResizeHandle({
  label,
  panel,
  width,
  min,
  max,
  defaultWidth,
  onResize,
  onResizingChange,
  className,
}: ResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (w: number) => clampWidth(w, min, max);

  const setResizing = (active: boolean) => {
    setDragging(active);
    onResizingChange?.(active);
    // Keep the resize cursor and stop text selection while the pointer is anywhere on the page
    document.body.style.cursor = active ? 'col-resize' : '';
    document.body.style.userSelect = active ? 'none' : '';
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
    setResizing(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.startX;
    onResize(clamp(drag.current.startWidth + (panel === 'before' ? delta : -delta)));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setResizing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    // Arrow keys move the handle; which one grows the panel depends on the side it is on
    const grow = panel === 'before' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = panel === 'before' ? 'ArrowLeft' : 'ArrowRight';
    let next: number | null = null;
    if (e.key === grow) next = width + step;
    else if (e.key === shrink) next = width - step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Enter') next = defaultWidth;
    if (next === null) return;
    e.preventDefault();
    onResize(clamp(next));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(Math.max(min, max))}
      tabIndex={0}
      title={`${label} (double-click to reset)`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onResize(clamp(defaultWidth))}
      onKeyDown={onKeyDown}
      className={cn(
        // 10px hit area straddling the panel border; the visible line is the span below
        'group absolute inset-y-0 z-20 w-2.5 cursor-col-resize touch-none outline-none',
        panel === 'before' ? '-right-[5px]' : '-left-[5px]',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full transition-colors',
          dragging
            ? 'bg-[var(--ws-accent)]'
            : 'bg-transparent group-hover:bg-[var(--ws-accent)]/60 group-focus-visible:bg-[var(--ws-accent)]'
        )}
      />
    </div>
  );
}
