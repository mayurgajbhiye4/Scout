import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import ResizeHandle from '../ResizeHandle';
import { CHAT_BOUNDS } from '../usePanelWidth';

interface CopilotDrawerProps {
  open: boolean;
  /** Docked compresses the canvas; overlay slides over it with a scrim. */
  mode: 'docked' | 'overlay';
  onClose: () => void;
  /** Current width (already clamped by the workspace) and the largest width allowed right now. */
  width: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
}

/**
 * Always mounted, so a reply keeps streaming while the drawer is collapsed. When closed the panel is
 * `inert`, which removes it from the tab order and the accessibility tree. Its left edge is a
 * resize handle in both modes.
 */
export default function CopilotDrawer({ open, mode, onClose, width, maxWidth, onWidthChange, children }: CopilotDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', !open);
  }, [open]);

  const handle = open ? (
    <ResizeHandle
      label="Resize chat panel"
      panel="after"
      width={width}
      min={CHAT_BOUNDS.min}
      max={maxWidth}
      defaultWidth={CHAT_BOUNDS.defaultWidth}
      onResize={onWidthChange}
      onResizingChange={setResizing}
      // The docked panel clips overflow (for its collapse animation), so keep the hit area inside it
      className={mode === 'docked' ? 'left-0' : undefined}
    />
  ) : null;

  if (mode === 'docked') {
    return (
      <aside
        ref={panelRef}
        aria-label="Research Copilot"
        aria-hidden={!open}
        style={{ width: open ? width : 0 }}
        className={cn(
          'ws-motion ws-ease relative h-full shrink-0 overflow-hidden bg-[var(--ws-drawer)]',
          !resizing && 'transition-[width] duration-[250ms]',
          open && 'border-l border-[var(--ws-line)]'
        )}
      >
        {handle}
        <div className="h-full" style={{ width }}>
          {children}
        </div>
      </aside>
    );
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'ws-motion absolute inset-0 z-30 bg-[var(--ws-scrim)] transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        ref={panelRef}
        aria-label="Research Copilot"
        aria-hidden={!open}
        style={{ width: `min(${width}px, 100%)` }}
        className={cn(
          'ws-motion ws-ease absolute inset-y-0 right-0 z-40 border-l border-[var(--ws-line)] bg-[var(--ws-glass)] shadow-[var(--ws-shadow)] backdrop-blur-xl',
          'transition-[transform,opacity] duration-[240ms]',
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
        )}
      >
        {handle}
        {children}
      </aside>
    </>
  );
}
