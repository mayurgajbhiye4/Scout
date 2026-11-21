import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AddSourceApi } from '../canvas/addSourceOptions';
import { useMediaQuery, type PagedSources } from '../useWorkspaceData';
import FlowSources, { type FlowRow } from './FlowSources';

interface SessionFlowProps {
  rows: FlowRow[];
  /** How many sources the session holds, loaded or not. */
  totalSources: number;
  /** The session's source list, for loading its older pages as the column is scrolled. */
  moreSources: Pick<PagedSources, 'hasNextPage' | 'isFetchingNextPage' | 'fetchNextPage'>;
  /** Row ids lit: the hovered or selected source, and the ones the latest answer cited. */
  litIds: Set<string>;
  /** The knowledge map, drawn to fill its box. */
  map: ReactNode;
  /** Where the map puts its title: the board's header. */
  headerSlot: (el: HTMLDivElement | null) => void;
  /** Where the map puts its controls and relationship filter: along the board's bottom edge. */
  dockSlot: (el: HTMLDivElement | null) => void;
  /** Width the copilot window covers at the board's right edge, kept clear of the map's controls; 0 when it's folded. */
  rightInset: number;
  selectedSourceId: string | null;
  comparedIds: Set<string>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  onToggleCompare: (id: string) => void;
  addSource: AddSourceApi;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
  sessionId: string | null;
  onSourceRemoved: (sourceId: string) => void;
}

/**
 * The session, left to right: the sources it reads in their own panel, then the knowledge map, which runs to the
 * right edge under the floating copilot window. Below 1024px the two stack in one scroll.
 */
export default function SessionFlow(props: SessionFlowProps) {
  const { rows, litIds, map, headerSlot, dockSlot, rightInset } = props;
  const wide = useMediaQuery('(min-width: 1024px)');

  // No box of its own: the title, the map (fading out at its edges) and its controls, on the board's panel
  const board = (
    <div className={cn('ws-panel relative flex flex-col px-4 pb-4 pt-3', wide ? 'h-full w-full' : 'h-[640px] shrink-0')}>
      <div ref={headerSlot} className="shrink-0 empty:hidden" />
      <div className="ws-fade-edges relative min-h-0 flex-1">{map}</div>
      <div
        ref={dockSlot}
        className="ws-motion shrink-0 pt-2 transition-[padding] duration-300 ws-ease empty:hidden"
        style={wide && rightInset > 0 ? { paddingRight: rightInset } : undefined}
      />
    </div>
  );

  const sources = (
    <FlowSources
      rows={rows}
      total={props.totalSources}
      hasMore={props.moreSources.hasNextPage}
      loadingMore={props.moreSources.isFetchingNextPage}
      onLoadMore={props.moreSources.fetchNextPage}
      litIds={litIds}
      selectedSourceId={props.selectedSourceId}
      comparedIds={props.comparedIds}
      onHoverSource={props.onHoverSource}
      onSelectSource={props.onSelectSource}
      onToggleCompare={props.onToggleCompare}
      addSource={props.addSource}
      onRetryPending={props.onRetryPending}
      onDismissPending={props.onDismissPending}
      sessionId={props.sessionId}
      onSourceRemoved={props.onSourceRemoved}
      wide={wide}
    />
  );

  if (!wide) {
    return (
      <div className="sidebar-scroll absolute inset-0 overflow-y-auto px-2 pb-2 pt-[68px]">
        <div className="relative flex min-h-full flex-col gap-4 px-3 py-5">
          {sources}
          {board}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 px-8 pb-6 pt-[84px]">
      <div className="relative grid h-full grid-cols-[260px_minmax(0,1fr)] gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col">{sources}</div>
        {/* The map runs to the right edge, under the copilot */}
        <div className="min-h-0">{board}</div>
      </div>
    </div>
  );
}
