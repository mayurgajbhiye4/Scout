import { useEffect, useRef, type ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import ResizeHandle from '../ResizeHandle';
import { DOCK_BOUNDS } from '../usePanelWidth';
import { useMediaQuery } from '../useWorkspaceData';

export type ViewMode = 'split' | 'graph' | 'sources';

/** Sources panel width (already clamped) and the largest width allowed inline / as a drawer. */
export interface DockSizing {
  width: number;
  maxInline: number;
  maxDrawer: number;
  onResize: (width: number) => void;
}

interface UnifiedKnowledgeCanvasProps {
  viewMode: ViewMode;
  sourceCount: number;
  dockDrawerOpen: boolean;
  onDockDrawerChange: (open: boolean) => void;
  renderDock: (opts: { layout: 'dock' | 'library'; onClose?: () => void }) => ReactNode;
  renderGraph: (opts: { headerStart?: ReactNode }) => ReactNode;
  dock: DockSizing;
}

/**
 * Split: sources dock beside the map (the dock becomes a drawer below 1024px).
 * Graph: the map fills the canvas and the dock floats in as a drawer on demand.
 * Sources: the library as a dense grid.
 */
export default function UnifiedKnowledgeCanvas({
  viewMode,
  sourceCount,
  dockDrawerOpen,
  onDockDrawerChange,
  renderDock,
  renderGraph,
  dock,
}: UnifiedKnowledgeCanvasProps) {
  const isWide = useMediaQuery('(min-width: 1024px)');
  const dockInline = viewMode === 'split' && isWide;
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerVisible = !dockInline && viewMode !== 'sources' && dockDrawerOpen;

  useEffect(() => {
    drawerRef.current?.toggleAttribute('inert', !drawerVisible);
  }, [drawerVisible]);

  if (viewMode === 'sources') {
    return <div className="h-full min-h-0">{renderDock({ layout: 'library' })}</div>;
  }

  const dockToggle = !dockInline ? (
    <button
      type="button"
      onClick={() => onDockDrawerChange(!dockDrawerOpen)}
      aria-expanded={dockDrawerOpen}
      className="font-ui flex h-9 items-center gap-1.5 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)] px-2.5 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
    >
      <PanelLeft size={15} />
      Sources
      <span className="tabular-nums text-[var(--ws-ink-faint)]">{sourceCount}</span>
    </button>
  ) : undefined;

  return (
    <div className="relative flex h-full min-h-0">
      {dockInline && (
        <div className="relative h-full shrink-0 border-r border-[var(--ws-line)]" style={{ width: Math.min(dock.width, dock.maxInline) }}>
          {renderDock({ layout: 'dock' })}
          <ResizeHandle
            label="Resize sources panel"
            panel="before"
            width={Math.min(dock.width, dock.maxInline)}
            min={DOCK_BOUNDS.min}
            max={dock.maxInline}
            defaultWidth={DOCK_BOUNDS.defaultWidth}
            onResize={dock.onResize}
          />
        </div>
      )}

      <div className="relative min-w-0 flex-1">{renderGraph({ headerStart: dockToggle })}</div>

      {!dockInline && (
        <>
          <div
            aria-hidden
            onClick={() => onDockDrawerChange(false)}
            className={cn(
              'ws-motion absolute inset-0 z-20 bg-[var(--ws-scrim)] transition-opacity duration-200',
              drawerVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          />
          <div
            ref={drawerRef}
            aria-hidden={!drawerVisible}
            className={cn(
              'ws-motion ws-ease absolute inset-y-0 left-0 z-30 border-r border-[var(--ws-line)] shadow-[var(--ws-shadow)] transition-transform duration-[240ms]',
              drawerVisible ? 'translate-x-0' : 'pointer-events-none -translate-x-full'
            )}
            style={{ width: `min(${Math.min(dock.width, dock.maxDrawer)}px, 100%)` }}
          >
            {renderDock({ layout: 'dock', onClose: () => onDockDrawerChange(false) })}
            {drawerVisible && (
              <ResizeHandle
                label="Resize sources panel"
                panel="before"
                width={Math.min(dock.width, dock.maxDrawer)}
                min={DOCK_BOUNDS.min}
                max={dock.maxDrawer}
                defaultWidth={DOCK_BOUNDS.defaultWidth}
                onResize={dock.onResize}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
