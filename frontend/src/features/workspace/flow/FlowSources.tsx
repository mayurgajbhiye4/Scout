import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ChevronDown, Loader2, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';
import { ADD_SOURCE_OPTIONS, KIND_ICON, runAddSourceOption, type AddSourceApi } from '../canvas/addSourceOptions';
import { kindColor, type SourceKind } from '../sourceMeta';
import { INGEST_PHASE_COPY, type PendingSource } from '../useWorkspaceData';
import RemoveSourcePopover from './RemoveSourcePopover';

/** One row of the sources column: a source in the session, or one still being added to it. */
export interface FlowRow {
  /** The source id, `pending:<tempId>` while it's being added, or `ghost:<action>` for an empty session's suggestions. */
  id: string;
  kind: SourceKind;
  title: string;
  origin: string;
  /** Concepts mapped from it; left out while it's being added. */
  conceptCount?: number;
  sourceId?: string;
  pending?: PendingSource;
}

interface FlowSourcesProps {
  rows: FlowRow[];
  /** How many sources the session holds, loaded or not; the rows can be just the first pages. */
  total?: number;
  /** More sources are on the server; `onLoadMore` fetches the next page. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Rows lit: hovered, selected, or cited by the latest answer. */
  litIds: Set<string>;
  selectedSourceId: string | null;
  /** Sources being compared on the map; empty unless two or more are. */
  comparedIds: Set<string>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  /** Ctrl/⌘-click: adds a source to the comparison, or takes it out. */
  onToggleCompare: (id: string) => void;
  addSource: AddSourceApi;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
  /** The open session; its sources can be removed from it. */
  sessionId: string | null;
  /** A source was taken out of the session. */
  onSourceRemoved: (sourceId: string) => void;
  /** Side-by-side layout: a column of rows in its own panel. Otherwise the rows wrap as a strip. */
  wide: boolean;
}

/** Whether a drag carries something that can be added as a source: files, links or text */
function carriesSource(data: DataTransfer) {
  return Array.from(data.types).some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain');
}

/**
 * The left of the session flow: the sources this session reads, in a panel beside the knowledge map.
 * Hovering one lights its concepts in the map; picking one narrows the map to it. Sources dropped here join the session.
 */
export default function FlowSources({
  rows,
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  litIds,
  selectedSourceId,
  comparedIds,
  onHoverSource,
  onSelectSource,
  onToggleCompare,
  addSource,
  onRetryPending,
  onDismissPending,
  sessionId,
  onSourceRemoved,
  wide,
}: FlowSourcesProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [dragOver, setDragOver] = useState(false);
  // The row whose "remove" question is open; it keeps its trash button showing meanwhile
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const empty = rows.length === 0;
  const pendingCount = rows.filter((r) => r.pending).length;
  const count = Math.max(rows.length, (total ?? 0) + pendingCount);

  // The next page loads as the end of the list scrolls into view: in the column's own scroll when wide, else the page's
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    }, { rootMargin: '120px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  const dropHandlers = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!carriesSource(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = addSource.disabled ? 'none' : 'copy';
      if (!dragOver) setDragOver(true);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (!addSource.disabled) addSource.dropSources(e.dataTransfer);
    },
  };

  const tile = (kind: SourceKind, busy?: boolean) => {
    const Icon = KIND_ICON[kind];
    const color = kindColor(kind, isLight);
    return (
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${busy ? 'var(--ws-ingest)' : color} 14%, transparent)`, color: busy ? 'var(--ws-ingest)' : color }}
        aria-hidden
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      </span>
    );
  };

  return (
    <section
      aria-label="Sources in this session"
      className={cn(
        // Its own panel, on the same ground as the map beside it, so nothing sits straight on the photo
        'ws-panel relative flex min-h-0 shrink-0 flex-col p-3 transition-colors',
        wide && 'max-h-full',
        dragOver && 'outline-2 outline-offset-2 outline-dashed outline-[var(--ws-accent)]/60'
      )}
      {...dropHandlers}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 px-1">
        <h2 className="text-[15px] font-semibold tracking-tight">Sources</h2>
        {!empty && <span className="text-[12.5px] tabular-nums text-[var(--ws-ink-soft)]">{count}</span>}
      </div>

      <div className={cn('min-h-0', wide && 'sidebar-scroll -mx-1 overflow-y-auto px-1 py-1')}>
        <ul className={cn('flex gap-2', wide ? 'flex-col' : 'flex-wrap')}>
          {empty &&
            ADD_SOURCE_OPTIONS.map((opt) => (
              <li key={opt.action} className={cn(!wide && 'min-w-0')}>
                <button
                  type="button"
                  disabled={addSource.disabled}
                  onClick={() => runAddSourceOption(addSource, opt.action)}
                  className="ui-press flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[var(--ws-line-strong)] py-2 pl-2 pr-4 text-left text-[13px] font-normal text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {tile(opt.kind)}
                  {opt.label}
                </button>
              </li>
            ))}

          {rows.map((row) => {
            const lit = litIds.has(row.id);
            const picked = Boolean(row.sourceId) && row.sourceId === selectedSourceId;
            const selected = picked || (row.sourceId !== undefined && comparedIds.has(row.sourceId));
            const pending = row.pending;
            const shell = cn(
              'flex w-full min-w-0 items-center gap-2.5 rounded-xl border bg-[var(--ws-card)] py-2 pl-2 pr-4 text-left transition-[border-color,box-shadow,background-color] duration-300',
              selected ? 'border-[var(--ws-accent)] ring-2 ring-[var(--ws-accent-wash)]' : lit ? 'border-[var(--ws-line-strong)] bg-[var(--ws-card-hover)]' : 'border-[var(--ws-line)]'
            );

            if (pending) {
              const failed = pending.status === 'failed';
              return (
                <li key={row.id} className={cn('ui-in-up', !wide && 'min-w-0 max-w-full')}>
                  <div className={cn(shell, failed && 'border-[var(--ws-danger)]/40')}>
                    {tile(row.kind, pending.status === 'ingesting')}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium" title={row.title}>{row.title}</span>
                      <span
                        className={cn('block truncate text-[12px]', failed ? 'text-[var(--ws-danger)]' : 'text-[var(--ws-ingest)]')}
                        title={failed ? pending.error : undefined}
                      >
                        {failed ? pending.error || "Couldn't add this source" : pending.status === 'ready' ? 'Mapped' : INGEST_PHASE_COPY[pending.phase ?? 'reading']}
                      </span>
                    </span>
                    {failed && (
                      <>
                        <button
                          type="button"
                          onClick={() => onRetryPending(pending.tempId)}
                          aria-label={`Retry adding ${row.title}`}
                          title="Retry"
                          className="ui-press grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                        >
                          <RotateCw size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismissPending(pending.tempId)}
                          aria-label={`Dismiss ${row.title}`}
                          title="Dismiss"
                          className="ui-press -mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            }

            const removable = Boolean(sessionId && row.sourceId);
            const confirming = confirmingId === row.id;
            return (
              <li key={row.id} className={cn('group relative', !wide && 'min-w-0 max-w-full')}>
                <button
                  type="button"
                  aria-pressed={selected}
                  title={`${picked ? 'Show the whole session on the map' : 'Show this source on the map'} (Ctrl/⌘-click to compare sources)`}
                  onMouseEnter={() => onHoverSource(row.sourceId ?? null)}
                  onMouseLeave={() => onHoverSource(null)}
                  onFocus={() => onHoverSource(row.sourceId ?? null)}
                  onBlur={() => onHoverSource(null)}
                  onClick={(e) => {
                    if ((e.ctrlKey || e.metaKey) && row.sourceId) onToggleCompare(row.sourceId);
                    else onSelectSource(picked ? null : row.sourceId ?? null);
                  }}
                  className={cn(
                    shell,
                    'ui-press hover:border-[var(--ws-line-strong)] cursor-pointer',
                    // Room for the trash button: while the row is hovered or focused, or always on touch screens
                    removable && 'transition-[border-color,box-shadow,padding] group-focus-within:pr-11 group-hover:pr-11 [@media(hover:none)]:pr-11',
                    removable && confirming && 'pr-11'
                  )}
                >
                  {tile(row.kind)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium" title={row.title}>{row.title}</span>
                    <span className="flex min-w-0 items-baseline gap-2 text-[12px] text-[var(--ws-ink-soft)]">
                      <span className="min-w-0 truncate">{row.origin}</span>
                      {row.conceptCount !== undefined && (
                        <span className="ml-auto shrink-0 tabular-nums">
                          {row.conceptCount} {row.conceptCount === 1 ? 'concept' : 'concepts'}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                {removable && (
                  <RemoveSourcePopover
                    sessionId={sessionId!}
                    sourceId={row.sourceId!}
                    title={row.title}
                    open={confirming}
                    onOpenChange={(open) => setConfirmingId(open ? row.id : null)}
                    onRemoved={onSourceRemoved}
                  >
                    <button
                      type="button"
                      aria-label={`Remove ${row.title} from this session`}
                      title="Remove from session"
                      className={cn(
                        'ui-press absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--ws-ink-faint)] transition-opacity hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-danger)] focus-visible:text-[var(--ws-danger)] cursor-pointer',
                        'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
                        confirming && 'opacity-100 text-[var(--ws-danger)]'
                      )}
                    >
                      <Trash2 size={13} />
                    </button>
                  </RemoveSourcePopover>
                )}
              </li>
            );
          })}
        </ul>
        <div ref={sentinelRef} className="pointer-events-none h-px w-full" aria-hidden />
        {loadingMore && (
          <p role="status" className="flex items-center justify-center gap-1.5 py-2 text-[12px] text-[var(--ws-ink-faint)]">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            Loading more sources
          </p>
        )}
      </div>

      <div className="shrink-0 pt-2 empty:hidden">
        {addSource.disabled ? (
          <p className="text-[12.5px] text-[var(--ws-danger)]">Paused for {addSource.cooldownSec}s</p>
        ) : empty ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ui-press group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--ws-line-strong)] text-[13px] font-normal text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
              >
                <Plus size={14} aria-hidden />
                Add source
                <ChevronDown size={13} className="opacity-70 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="font-ui min-w-[240px]">
              {ADD_SOURCE_OPTIONS.map((opt) => {
                const Icon = KIND_ICON[opt.kind];
                return (
                  <DropdownMenuItem key={opt.action} onSelect={() => runAddSourceOption(addSource, opt.action)} className="gap-2.5 py-2 text-[13px]">
                    <Icon size={15} style={{ color: kindColor(opt.kind, isLight) }} />
                    {opt.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </section>
  );
}
