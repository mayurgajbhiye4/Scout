import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceNode } from '../useWorkspaceData';
import { GROUP_ORDER, groupOf } from './entityTypes';
import { groupEntities, type NodeMark } from './graphView';
import ShapeSwatch from './ShapeSwatch';

interface EntityNavigatorProps {
  /** What's on the map */
  nodes: WorkspaceNode[];
  markOf: (n: WorkspaceNode) => NodeMark;
  selectedId: string | null;
  /** The row under the pointer or the arrow keys, so the map can light it; null when there's none */
  onHover: (id: string | null) => void;
  onSelect: (n: WorkspaceNode) => void;
  /** Beside the orb: no type pills, a shorter list */
  compact?: boolean;
  className?: string;
}

/**
 * Every entity on the map as a searchable list, grouped by type. Picking one selects it, and the map flies to it;
 * the arrow keys walk the list from the search box and light each row's neighbourhood on the map as they go.
 */
export default function EntityNavigator({ nodes, markOf, selectedId, onHover, onSelect, compact = false, className }: EntityNavigatorProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const allGroups = useMemo(() => groupEntities(nodes, '', null, groupOf, GROUP_ORDER), [nodes]);
  // A picked type that's no longer on the map stops filtering
  const types = picked && allGroups.some((g) => picked.has(g.label)) ? picked : null;
  const groups = useMemo(() => groupEntities(nodes, query, types, groupOf, GROUP_ORDER), [nodes, query, types]);
  const flat = useMemo(() => groups.flatMap((g) => g.nodes), [groups]);
  const indexOf = useMemo(() => new Map(flat.map((n, i) => [n.id, i])), [flat]);
  const activeIndex = flat.findIndex((n) => n.id === activeId);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    // optionId only depends on listId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const activate = (index: number) => {
    const n = flat[index];
    setActiveId(n?.id ?? null);
    onHover(n?.id ?? null);
  };

  const toggleType = (label: string) => {
    const next = new Set(types ?? []);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setPicked(next.size > 0 ? next : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activate(activeIndex < 0 ? (step > 0 ? 0 : flat.length - 1) : (activeIndex + step + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      const n = flat[activeIndex] ?? flat[0];
      if (n) {
        e.preventDefault();
        onSelect(n);
      }
    } else if (e.key === 'Escape' && (query || activeId)) {
      // Clears the search first; the next Escape is the map's
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
      activate(-1);
    }
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex min-h-0 flex-col rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-glass)] p-3 shadow-[var(--ws-shadow-sm)] backdrop-blur-md',
        className
      )}
    >
      {!compact && (
        <p className="mb-2 px-1 text-[12.5px] font-semibold text-[var(--ws-ink)]">
          Entities <span className="font-normal text-[var(--ws-ink-faint)] tabular-nums">({allGroups.reduce((sum, g) => sum + g.nodes.length, 0)})</span>
        </p>
      )}
      <div className="relative shrink-0">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-ink-faint)]" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveId(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => activeId && activate(-1)}
          placeholder="Find an entity"
          aria-label="Find an entity on the map"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className="h-8 w-full rounded-full border border-[var(--ws-line)] bg-[var(--ws-dock)] pl-8 pr-8 text-[12.5px] text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] focus-visible:border-[var(--ws-accent)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {!compact && allGroups.length > 1 && (
        <div role="group" aria-label="Filter by type" className="mt-2 flex shrink-0 flex-wrap gap-1">
          {allGroups.map((g) => {
            const mark = markOf(g.nodes[0]!);
            const on = Boolean(types?.has(g.label));
            return (
              <button
                key={g.label}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(g.label)}
                className={cn(
                  'ui-press flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                  on
                    ? 'border-[var(--ws-accent)] bg-[var(--ws-accent-wash)] text-[var(--ws-ink)]'
                    : 'border-[var(--ws-line)] text-[var(--ws-ink-soft)] hover:border-[var(--ws-line-strong)] hover:text-[var(--ws-ink)]'
                )}
              >
                <ShapeSwatch shape={mark.shape} color={mark.color} size={11} />
                {g.label}
                <span className="tabular-nums text-[var(--ws-ink-faint)]">{g.nodes.length}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        id={listId}
        role="listbox"
        aria-label="Entities on the map"
        onMouseLeave={() => onHover(null)}
        className={cn('sidebar-scroll mt-2 min-h-0 overflow-y-auto pr-0.5', compact ? 'max-h-[240px]' : 'flex-1')}
      >
        {flat.length === 0 && <p className="px-2 py-3 text-[12px] text-[var(--ws-ink-faint)]">{query ? 'Nothing matches' : 'Nothing on the map yet'}</p>}
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className="mb-1.5 last:mb-0">
            <p className="sticky top-0 z-[1] bg-[var(--ws-glass)] px-2 py-1 text-[11px] font-medium text-[var(--ws-ink-faint)] backdrop-blur-md" aria-hidden>
              {g.label} <span className="tabular-nums">{g.nodes.length}</span>
            </p>
            {g.nodes.map((n) => {
              const i = indexOf.get(n.id)!;
              const mark = markOf(n);
              const selected = n.id === selectedId;
              return (
                <div
                  key={n.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  title={n.description ?? n.label}
                  onMouseEnter={() => onHover(n.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(n)}
                  className={cn(
                    'flex h-7 items-center gap-2 rounded-full px-2 text-[12.5px] cursor-pointer',
                    selected ? 'bg-[var(--ws-accent-wash)] font-semibold text-[var(--ws-ink)]' : 'text-[var(--ws-ink)] hover:bg-[var(--ws-card-hover)]',
                    i === activeIndex && !selected && 'bg-[var(--ws-card-hover)]',
                    i === activeIndex && 'ring-1 ring-[var(--ws-accent)]'
                  )}
                >
                  <ShapeSwatch shape={mark.shape} color={mark.color} size={12} />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--ws-ink-faint)]" title={`${n.degree} ${n.degree === 1 ? 'connection' : 'connections'}`}>
                    {n.degree}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
