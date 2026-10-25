import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  MoreVertical,
  Plus,
  RotateCw,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { sourcesApi, type Source } from '@/api/sources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/features/theme';
import { soundEffects } from '@/lib/soundEffects';
import { cn } from '@/lib/utils';
import {
  KIND_META,
  SOURCE_KINDS,
  getChunkCount,
  getSourceKind,
  getSourceState,
  getSourceSubtitle,
  getSourceTitle,
  getSourceUrl,
  kindColor,
  type SourceKind,
} from '../sourceMeta';
import type { PendingSource } from '../useWorkspaceData';
import { ADD_SOURCE_OPTIONS, KIND_ICON, runAddSourceOption, type AddSourceApi } from './addSourceOptions';

export interface EntityFocus {
  id: string;
  name: string;
  type: string;
}

interface SourcesDockProps {
  layout: 'dock' | 'library';
  isAuthenticated: boolean;
  onSignIn: () => void;
  sources: Source[];
  pending: PendingSource[];
  isLoading: boolean;
  isError: boolean;
  onReload: () => void;
  sessionSourceIds: Set<string>;
  entityCountBySource: Map<string, number>;
  hoveredSourceId: string | null;
  selectedSourceId: string | null;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  focusEntity: EntityFocus | null;
  focusSourceIds: Set<string> | null;
  onClearEntity: () => void;
  onAskAboutSource: (source: Source) => void;
  addSource: AddSourceApi;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
  onClose?: () => void;
}

type KindFilter = 'all' | SourceKind;

export default function SourcesDock({
  layout,
  isAuthenticated,
  onSignIn,
  sources,
  pending,
  isLoading,
  isError,
  onReload,
  sessionSourceIds,
  entityCountBySource,
  hoveredSourceId,
  selectedSourceId,
  onHoverSource,
  onSelectSource,
  focusEntity,
  focusSourceIds,
  onClearEntity,
  onAskAboutSource,
  addSource,
  onRetryPending,
  onDismissPending,
  onClose,
}: SourcesDockProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sourcesApi.deleteSource(id),
    onSuccess: (_data, id) => {
      soundEffects.playDelete();
      if (selectedSourceId === id) onSelectSource(null);
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-graph'] });
      queryClient.invalidateQueries({ queryKey: ['session-sources'] });
    },
    onSettled: () => setConfirmDeleteId(null),
  });

  const counts = useMemo(() => {
    const c: Record<SourceKind, number> = { pdf: 0, youtube: 0, github: 0, web: 0, notes: 0 };
    for (const s of sources) c[getSourceKind(s)] += 1;
    return c;
  }, [sources]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources.filter((s) => {
      if (focusSourceIds && !focusSourceIds.has(s.id)) return false;
      if (kindFilter !== 'all' && getSourceKind(s) !== kindFilter) return false;
      if (!q) return true;
      return (
        getSourceTitle(s).toLowerCase().includes(q) ||
        (s.canonical_uri || '').toLowerCase().includes(q)
      );
    });
  }, [sources, kindFilter, query, focusSourceIds]);

  // Keep the selected card visible when the selection comes from the graph.
  useEffect(() => {
    if (!selectedSourceId) return;
    cardRefs.current.get(selectedSourceId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSourceId]);

  const isLibrary = layout === 'library';
  const showPending = pending.length > 0 && !focusEntity;

  return (
    <section
      aria-label="Sources"
      className={cn('font-ui flex h-full min-h-0 flex-col bg-[var(--ws-dock)] text-[var(--ws-ink)]')}
    >
      {/* Header */}
      <div className={cn('shrink-0 space-y-3 px-4 pt-4 pb-3', isLibrary && 'sm:px-8 sm:pt-6')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Sources
            <span className="ml-2 font-normal text-[var(--ws-ink-faint)] tabular-nums">{sources.length}</span>
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sources"
              className="grid h-8 w-8 place-items-center rounded-[9px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className={cn('flex flex-col gap-3', isLibrary && 'lg:flex-row lg:items-center')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'group flex h-10 items-center justify-between gap-2 rounded-[12px] px-3.5 text-[13.5px] font-semibold transition-[filter,background] cursor-pointer',
                  isLibrary && 'lg:w-56 shrink-0',
                  addSource.disabled
                    ? 'border border-[var(--ws-danger)]/50 bg-[var(--ws-danger)]/10 text-[var(--ws-danger)]'
                    : 'bg-[var(--ws-accent)] text-white hover:brightness-110'
                )}
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} strokeWidth={2.4} />
                  {addSource.disabled ? `Add source in ${addSource.cooldownSec}s` : 'Add source'}
                </span>
                <ChevronDown size={15} className="opacity-80 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="font-ui w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]">
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

          <div className={cn('relative', isLibrary && 'lg:order-last lg:w-72')}>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-ink-faint)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sources"
              aria-label="Search sources"
              className="h-9 w-full rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] pl-9 pr-3 text-base sm:text-[13px] text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] outline-none focus:border-[var(--ws-accent)] focus:ring-2 focus:ring-[var(--ws-accent-wash)]"
            />
          </div>

          <div role="tablist" aria-label="Filter by type" className={cn('flex gap-1.5 overflow-x-auto no-scrollbar', isLibrary && 'lg:flex-1')}>
            <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')} label="All" count={sources.length} />
            {SOURCE_KINDS.filter((k) => counts[k] > 0).map((k) => (
              <FilterChip
                key={k}
                active={kindFilter === k}
                onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
                label={KIND_META[k].label}
                count={counts[k]}
              />
            ))}
          </div>
        </div>

        {focusEntity && (
          <div className="flex items-start gap-2 rounded-[12px] border border-[var(--ws-accent)]/40 bg-[var(--ws-accent-wash)] px-3 py-2 text-[12.5px] leading-snug">
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ws-accent)]" />
            <p className="min-w-0 flex-1 text-[var(--ws-ink-soft)]">
              Showing {visible.length} {visible.length === 1 ? 'source' : 'sources'} that mention{' '}
              <span className="font-semibold text-[var(--ws-ink)]">{focusEntity.name}</span>
            </p>
            <button
              type="button"
              onClick={onClearEntity}
              aria-label="Show all sources"
              className="-mr-1 grid h-5 w-5 place-items-center rounded text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)] cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-3 pb-3 sidebar-scroll',
          isLibrary && 'sm:px-8 sm:pb-8'
        )}
        onMouseLeave={() => onHoverSource(null)}
      >
        <div className={cn('flex flex-col gap-2', isLibrary && 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3')}>
          {showPending &&
            pending.map((p) => (
              <PendingCard
                key={p.tempId}
                item={p}
                color={kindColor(p.kind, isLight)}
                onRetry={() => onRetryPending(p.tempId)}
                onDismiss={() => onDismissPending(p.tempId)}
              />
            ))}

          {!isAuthenticated ? (
            <EmptyState
              title="Sign in to build a library"
              body="Sources you add are indexed, mapped on the canvas and used to ground Copilot's answers."
              action={{ label: 'Log in', onClick: onSignIn }}
            />
          ) : isLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-card)]" />
            ))
          ) : isError ? (
            <EmptyState
              title="Sources didn't load"
              body="The library request failed. Check your connection, then reload."
              action={{ label: 'Reload sources', onClick: onReload }}
            />
          ) : sources.length === 0 && pending.length === 0 ? (
            <EmptyState
              title="Your library is empty"
              body="Add a paper, video, repository or page. Scout indexes it and maps what it talks about on the canvas."
              action={{ label: 'Add a web page or PDF link', onClick: () => addSource.openLink('web') }}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No sources match"
              body={focusEntity ? `None of the filtered sources mention ${focusEntity.name}.` : 'Try a different search or type filter.'}
              action={{
                label: 'Clear filters',
                onClick: () => {
                  setQuery('');
                  setKindFilter('all');
                  onClearEntity();
                },
              }}
            />
          ) : (
            visible.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                isLight={isLight}
                inSession={sessionSourceIds.has(source.id)}
                entityCount={entityCountBySource.get(source.id) ?? 0}
                isSelected={selectedSourceId === source.id}
                isHovered={hoveredSourceId === source.id}
                confirmingDelete={confirmDeleteId === source.id}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === source.id}
                registerRef={(el) => {
                  if (el) cardRefs.current.set(source.id, el);
                  else cardRefs.current.delete(source.id);
                }}
                onHover={onHoverSource}
                onSelect={() => onSelectSource(selectedSourceId === source.id ? null : source.id)}
                onAsk={() => onAskAboutSource(source)}
                onRequestDelete={() => setConfirmDeleteId(source.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteMutation.mutate(source.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer quick-add */}
      {!isLibrary && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--ws-line)] px-4 py-2.5">
          <span className="text-[12.5px] font-medium text-[var(--ws-ink-soft)]">Add more</span>
          <div className="flex items-center gap-0.5">
            {ADD_SOURCE_OPTIONS.map((opt) => {
              const Icon = KIND_ICON[opt.kind];
              return (
                <button
                  key={opt.action}
                  type="button"
                  onClick={() => runAddSourceOption(addSource, opt.action)}
                  aria-label={`Add ${opt.label}`}
                  title={`Add ${opt.label}`}
                  className="grid h-8 w-8 place-items-center rounded-[9px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 text-[12.5px] font-medium transition-colors cursor-pointer',
        active
          ? 'border-[var(--ws-accent)]/60 bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)]'
          : 'border-[var(--ws-line)] text-[var(--ws-ink-soft)] hover:border-[var(--ws-line-strong)] hover:text-[var(--ws-ink)]'
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function StatusBadge({ state }: { state: ReturnType<typeof getSourceState> }) {
  if (state === 'indexed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--ws-accent-ink)]">
        <Check size={12} strokeWidth={2.6} />
        Indexed
      </span>
    );
  }
  if (state === 'ingesting') {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--ws-ingest)]">
        <Loader2 size={12} className="animate-spin" />
        Ingesting
      </span>
    );
  }
  if (state === 'stale') {
    return <span className="text-[11.5px] font-medium text-[var(--ws-ink-faint)]">Needs re-index</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-red-600 dark:text-red-400">
      <TriangleAlert size={12} />
      Failed
    </span>
  );
}

function KindTile({ kind, color, size = 44 }: { kind: SourceKind; color: string; size?: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[12px]"
      style={{ width: size, height: size, backgroundColor: `${color}1f`, color }}
    >
      <Icon size={Math.round(size * 0.45)} />
    </div>
  );
}

function IngestBar() {
  return (
    <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[var(--ws-line)]">
      <div className="ws-ingest-bar h-full w-2/5 rounded-full bg-[var(--ws-ingest)]" />
    </div>
  );
}

interface SourceCardProps {
  source: Source;
  isLight: boolean;
  inSession: boolean;
  entityCount: number;
  isSelected: boolean;
  isHovered: boolean;
  confirmingDelete: boolean;
  isDeleting: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onHover: (id: string | null) => void;
  onSelect: () => void;
  onAsk: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function SourceCard({
  source,
  isLight,
  inSession,
  entityCount,
  isSelected,
  isHovered,
  confirmingDelete,
  isDeleting,
  registerRef,
  onHover,
  onSelect,
  onAsk,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: SourceCardProps) {
  const kind = getSourceKind(source);
  const color = kindColor(kind, isLight);
  const state = getSourceState(source);
  const chunks = getChunkCount(source);
  const url = getSourceUrl(source);
  const title = getSourceTitle(source);

  return (
    <div
      ref={registerRef}
      onMouseEnter={() => onHover(source.id)}
      onFocus={() => onHover(source.id)}
      className={cn(
        'group relative rounded-2xl border bg-[var(--ws-card)] p-3 transition-[border-color,background-color,box-shadow] duration-150',
        isSelected
          ? 'border-[var(--ws-accent)] shadow-[0_0_0_3px_var(--ws-accent-wash)]'
          : isHovered
            ? 'border-[var(--ws-line-strong)] bg-[var(--ws-card-hover)]'
            : 'border-[var(--ws-line)]'
      )}
    >
      {/* Whole-card hit target; the menu sits above it. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} ${title}`}
        className="absolute inset-0 z-0 rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ws-accent)]"
      />

      <div className="pointer-events-none relative flex gap-3">
        <KindTile kind={kind} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate pt-0.5 text-[13.5px] font-semibold leading-snug" title={title}>
              {title}
            </h3>
          </div>
          <p className="truncate text-[12.5px] text-[var(--ws-ink-soft)]" title={source.canonical_uri || undefined}>
            {getSourceSubtitle(source)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              {KIND_META[kind].label}
            </span>
            {chunks > 0 && (
              <span className="text-[11.5px] text-[var(--ws-ink-soft)] tabular-nums">
                {chunks} {chunks === 1 ? 'chunk' : 'chunks'}
              </span>
            )}
            {entityCount > 0 && (
              <span className="text-[11.5px] text-[var(--ws-ink-soft)] tabular-nums">
                {entityCount} {entityCount === 1 ? 'concept' : 'concepts'}
              </span>
            )}
            <StatusBadge state={state} />
            {inSession && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--ws-accent-ink)]">
                <Link2 size={12} />
                In this chat
              </span>
            )}
          </div>
          {state === 'ingesting' && <IngestBar />}
        </div>
      </div>

      <div className="absolute right-2 top-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${title}`}
              className="grid h-7 w-7 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] opacity-100 hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 cursor-pointer"
            >
              <MoreVertical size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="font-ui">
            <DropdownMenuItem onSelect={onAsk} className="gap-2 text-[13px]">
              <MessageSquare size={14} /> Ask Copilot about this
            </DropdownMenuItem>
            {url && (
              <DropdownMenuItem asChild className="gap-2 text-[13px]">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} /> Open original
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRequestDelete} className="gap-2 text-[13px] text-red-600 dark:text-red-400">
              <Trash2 size={14} /> Delete source
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {confirmingDelete && (
        <div className="relative z-10 mt-3 flex items-center justify-between gap-2 rounded-[12px] border border-red-500/30 bg-red-500/[0.06] px-3 py-2">
          <span className="text-[12.5px] text-[var(--ws-ink)]">Delete from your library?</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onCancelDelete}
              className="h-7 rounded-[9px] px-2.5 text-[12px] font-medium text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)] cursor-pointer"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="inline-flex h-7 items-center gap-1 rounded-[9px] bg-red-600 px-2.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-60 cursor-pointer"
            >
              {isDeleting && <Loader2 size={12} className="animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingCard({
  item,
  color,
  onRetry,
  onDismiss,
}: {
  item: PendingSource;
  color: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failed = item.status === 'failed';
  return (
    <div
      className={cn(
        'rounded-2xl border bg-[var(--ws-card)] p-3',
        failed ? 'border-red-500/40' : 'border-dashed border-[var(--ws-ingest)]/60'
      )}
    >
      <div className="flex gap-3">
        <KindTile kind={item.kind} color={color} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate pt-0.5 text-[13.5px] font-semibold leading-snug" title={item.input}>
            {item.title}
          </h3>
          {failed ? (
            <p className="mt-0.5 text-[12.5px] leading-snug text-red-600 dark:text-red-400">{item.error}</p>
          ) : (
            <p className="truncate text-[12.5px] text-[var(--ws-ink-soft)]">Extracting, embedding and mapping concepts</p>
          )}
          {failed ? (
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-7 items-center gap-1 rounded-[9px] border border-[var(--ws-line)] px-2.5 text-[12px] font-medium hover:border-[var(--ws-line-strong)] cursor-pointer"
              >
                <RotateCw size={12} /> Retry
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="h-7 rounded-[9px] px-2.5 text-[12px] font-medium text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <IngestBar />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action: { label: string; onClick: () => void } }) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-[var(--ws-line-strong)] px-5 py-8 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-[12.5px] leading-relaxed text-[var(--ws-ink-soft)]">{body}</p>
      <button
        type="button"
        onClick={action.onClick}
        className="mt-4 h-8 rounded-[9px] border border-[var(--ws-line-strong)] px-3 text-[12.5px] font-medium hover:border-[var(--ws-accent)] hover:text-[var(--ws-accent-ink)] cursor-pointer"
      >
        {action.label}
      </button>
    </div>
  );
}
