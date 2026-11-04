import { useState, type DragEvent, type Ref } from 'react';
import { ChevronDown, Loader2, Plus, RotateCw, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';
import { ADD_SOURCE_OPTIONS, KIND_ICON, runAddSourceOption, type AddSourceApi } from '../canvas/addSourceOptions';
import { kindColor, type SourceKind } from '../sourceMeta';
import { INGEST_PHASE_COPY, type PendingSource } from '../useWorkspaceData';

/** One row of the sources column: a source in the session, or one still being added to it. */
export interface FlowRow {
  /** The source id, `pending:<tempId>` while it's being added, or `ghost:<action>` for an empty session's suggestions. */
  id: string;
  kind: SourceKind;
  title: string;
  origin: string;
  sourceId?: string;
  pending?: PendingSource;
}

interface FlowSourcesProps {
  rows: FlowRow[];
  /** Rows whose beam is lit: hovered, selected, or cited by the latest answer. */
  litIds: Set<string>;
  selectedSourceId: string | null;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  addSource: AddSourceApi;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
  /** Registers each row (and suggestion) so the flow can draw its beam. */
  rowRef: (id: string) => (el: HTMLElement | null) => void;
  listRef: Ref<HTMLDivElement>;
  onListScroll: () => void;
  /** Three-column layout: a centred column of rows. Otherwise the rows wrap as a strip. */
  wide: boolean;
}

/** Whether a drag carries something that can be added as a source: files, links or text */
function carriesSource(data: DataTransfer) {
  return Array.from(data.types).some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain');
}

/**
 * The left of the session flow: the sources this session reads, each a pill whose beam runs into the knowledge map.
 * Hovering one lights its concepts in the map; picking one narrows the map to it. Sources dropped here join the session.
 */
export default function FlowSources({
  rows,
  litIds,
  selectedSourceId,
  onHoverSource,
  onSelectSource,
  addSource,
  onRetryPending,
  onDismissPending,
  rowRef,
  listRef,
  onListScroll,
  wide,
}: FlowSourcesProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [dragOver, setDragOver] = useState(false);
  const empty = rows.length === 0;

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
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
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
      className={cn('relative flex min-h-0 flex-col rounded-4xl transition-colors', wide ? 'h-full justify-center' : 'shrink-0', dragOver && 'bg-[var(--ws-accent-wash)] outline-2 outline-offset-4 outline-dashed outline-[var(--ws-accent)]/60')}
      {...dropHandlers}
    >
      <div className="flex shrink-0 items-baseline gap-2 px-1 pb-2">
        <h2 className="text-[13.5px] font-semibold">Sources</h2>
        {!empty && <span className="text-[12px] tabular-nums text-[var(--ws-ink-faint)]">{rows.length}</span>}
      </div>

      <div ref={listRef} onScroll={onListScroll} className={cn('min-h-0', wide && 'sidebar-scroll -mx-2 -my-1 overflow-y-auto px-2 py-3')}>
        <ul className={cn('flex gap-2', wide ? 'flex-col' : 'flex-wrap')}>
          {empty &&
            ADD_SOURCE_OPTIONS.map((opt) => (
              <li key={opt.action} ref={rowRef(`ghost:${opt.action}`)} className={cn(!wide && 'min-w-0')}>
                <button
                  type="button"
                  disabled={addSource.disabled}
                  onClick={() => runAddSourceOption(addSource, opt.action)}
                  className="ui-press flex w-full items-center gap-2.5 rounded-full border border-dashed border-[var(--ws-accent)]/50 py-2 pl-2 pr-4 text-left text-[13px] font-medium text-[var(--ws-ink-soft)] hover:border-[var(--ws-accent)] hover:bg-[var(--ws-accent-wash)] hover:text-[var(--ws-ink)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {tile(opt.kind)}
                  {opt.label}
                </button>
              </li>
            ))}

          {rows.map((row) => {
            const lit = litIds.has(row.id);
            const selected = Boolean(row.sourceId) && row.sourceId === selectedSourceId;
            const pending = row.pending;
            const shell = cn(
              'flex w-full min-w-0 items-center gap-2.5 rounded-full border bg-[var(--ws-dock)] py-2 pl-2 pr-4 text-left shadow-[var(--ws-shadow-sm)] transition-[border-color,box-shadow] duration-300',
              selected ? 'border-[var(--ws-accent)] ring-2 ring-[var(--ws-accent-wash)]' : lit ? 'border-[var(--ws-accent)]' : 'border-[var(--ws-line)]'
            );

            if (pending) {
              const failed = pending.status === 'failed';
              return (
                <li key={row.id} ref={rowRef(row.id)} className={cn('ui-in-up', !wide && 'min-w-0 max-w-full')}>
                  <div className={cn(shell, failed && 'border-[var(--ws-danger)]/40')}>
                    {tile(row.kind, pending.status === 'ingesting')}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold" title={row.title}>{row.title}</span>
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

            return (
              <li key={row.id} ref={rowRef(row.id)} className={cn(!wide && 'min-w-0 max-w-full')}>
                <button
                  type="button"
                  aria-pressed={selected}
                  title={selected ? 'Show the whole session on the map' : 'Show this source on the map'}
                  onMouseEnter={() => onHoverSource(row.sourceId ?? null)}
                  onMouseLeave={() => onHoverSource(null)}
                  onFocus={() => onHoverSource(row.sourceId ?? null)}
                  onBlur={() => onHoverSource(null)}
                  onClick={() => onSelectSource(selected ? null : row.sourceId ?? null)}
                  className={cn(shell, 'ui-press hover:border-[var(--ws-line-strong)] cursor-pointer')}
                >
                  {tile(row.kind)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" title={row.title}>{row.title}</span>
                    <span className="block truncate text-[12px] text-[var(--ws-ink-faint)]">{row.origin}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 px-1 pt-2 empty:hidden">
        {addSource.disabled ? (
          <p className="text-[12.5px] text-[var(--ws-danger)]">Paused for {addSource.cooldownSec}s</p>
        ) : empty ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ui-press group flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--ws-line-strong)] text-[13px] font-medium text-[var(--ws-ink-soft)] hover:border-[var(--ws-accent)]/60 hover:bg-[var(--ws-accent-wash)] hover:text-[var(--ws-ink)] cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.4} />
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
