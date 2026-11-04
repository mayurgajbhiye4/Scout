import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Layers, Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import type { Session } from '@/api/sessions';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import { formatRelativeTime, formatSessionTitle } from '@/lib/formatters';
import { staggerDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { SessionsList } from './useSessionsList';

// Each page of older sessions staggers in from its own first row, not from the top of the list
const PAGE_SIZE = 20;

interface SessionsRailProps {
  list: SessionsList;
  activeId: string | null;
  onOpen: (session: { id: string; title: string }) => void;
  onNew: () => void;
  onDeleted: (sessionId: string) => void;
  /** Folds the floating sessions window back into its launcher. */
  onMinimize?: () => void;
  /** Replaces the "Sessions" heading, e.g. with the switch between sessions and sources. */
  title?: ReactNode;
}

/** The sessions window of the research home: every session, newest first, with search and a way to start a new one. */
export default function SessionsRail({ list, activeId, onOpen, onNew, onDeleted, onMinimize, title }: SessionsRailProps) {
  const { sessions, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = list;
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || (s.session_summary || '').toLowerCase().includes(q)
    );
  }, [sessions, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) fetchNextPage();
    }, { root, rootMargin: '80px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section aria-label="Sessions" className="font-ui flex h-full min-h-0 flex-col text-[var(--ws-ink)]">
      <div className="shrink-0 space-y-3 px-3 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2 pl-1">
          {title ?? (
            <h2 className="text-[15px] font-semibold tracking-tight">
              Sessions
              {!isLoading && <span className="ml-2 font-normal text-[var(--ws-ink-faint)] tabular-nums">{sessions.length}{hasNextPage ? '+' : ''}</span>}
            </h2>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNew}
              title="New research (Ctrl/⌘ N)"
              className="ui-press flex h-8 items-center gap-1 rounded-full bg-[var(--ws-accent-wash)] px-2.5 text-[12.5px] font-semibold text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30 hover:brightness-110 cursor-pointer"
            >
              <Plus size={14} strokeWidth={2.4} />
              New
            </button>
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                aria-label="Minimize sessions"
                title="Minimize"
                className="ui-press grid h-8 w-8 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
              >
                <Minus size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-ink-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sessions"
            aria-label="Filter sessions"
            className="h-9 w-full rounded-full border border-[var(--ws-line)] bg-[var(--ws-canvas)] pl-8 pr-3 text-base text-[var(--ws-ink)] outline-none placeholder:text-[var(--ws-ink-faint)] focus:border-[var(--ws-accent)] focus:ring-2 focus:ring-[var(--ws-accent-wash)] sm:text-[13px]"
          />
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 sidebar-scroll">
        {isLoading ? (
          <div className="flex flex-col gap-1" aria-label="Loading sessions">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse space-y-1.5 rounded-full px-2.5 py-2.5">
                <div className="h-3 w-4/5 rounded-full bg-[var(--ws-card-hover)]" />
                <div className="h-2.5 w-1/3 rounded-full bg-[var(--ws-card-hover)]" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <RailMessage title="Sessions didn't load" action={{ label: 'Try again', onClick: refetch }} />
        ) : visible.length === 0 ? (
          query ? (
            <RailMessage title={`Nothing matches “${query}”`} action={{ label: 'Clear filter', onClick: () => setQuery('') }} />
          ) : (
            <RailMessage title="No sessions yet" />
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((session, idx) => (
              <SessionRow
                key={session.id}
                session={session}
                index={idx}
                active={session.id === activeId}
                onOpen={() => onOpen({ id: session.id, title: session.title })}
                onDeleted={() => onDeleted(session.id)}
              />
            ))}
          </ul>
        )}

        <div ref={sentinelRef} className="pointer-events-none h-1 w-full" />
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-[12px] text-[var(--ws-ink-faint)]">
            <Loader2 size={12} className="animate-spin" />
            Loading older sessions
          </div>
        )}
      </div>
    </section>
  );
}

function SessionRow({
  session,
  index,
  active,
  onOpen,
  onDeleted,
}: {
  session: Session;
  index: number;
  active: boolean;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const title = formatSessionTitle(session.title);
  const sourceCount = session.sources?.length ?? 0;
  return (
    <li
      style={staggerDelay(index % PAGE_SIZE, 120)}
      className={cn(
        'ui-in-up group relative flex items-center gap-2 rounded-full py-2 pl-2.5 pr-1 transition-colors',
        active ? 'bg-[var(--ws-accent-wash)]' : 'hover:bg-[var(--ws-card-hover)] focus-within:bg-[var(--ws-card-hover)]'
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--ws-accent)]" aria-hidden />}
      <div className="min-w-0 flex-1">
        {/* Its ::after covers the row so the whole surface opens the session */}
        <button
          type="button"
          onClick={onOpen}
          aria-current={active ? 'page' : undefined}
          title={title}
          className={cn(
            'block w-full truncate text-left text-[13.5px] outline-none after:absolute after:inset-0 after:rounded-full focus-visible:after:ring-2 focus-visible:after:ring-[var(--ws-accent)] cursor-pointer',
            active ? 'font-semibold text-[var(--ws-ink)]' : 'font-medium'
          )}
        >
          {title}
        </button>
        <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--ws-ink-faint)]">
          <span>{formatRelativeTime(session.last_activity_at || session.created_at)}</span>
          {sourceCount > 0 && (
            <span className="flex items-center gap-1">
              <Layers size={11} aria-hidden />
              {sourceCount === 1 ? '1 source' : `${sourceCount} sources`}
            </span>
          )}
        </p>
      </div>
      <DeleteSessionPopover session={session} side="right" align="center" sideOffset={8} onSuccess={onDeleted}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Delete ${title}`}
          title="Delete session"
          className="ui-press relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] opacity-100 hover:bg-[var(--ws-card)] hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </DeleteSessionPopover>
    </li>
  );
}

function RailMessage({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="ui-in-up px-3 py-8 text-center">
      <p className="text-[13.5px] font-semibold">{title}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="ui-press mt-3 h-8 rounded-full border border-[var(--ws-line)] px-3 text-[12.5px] font-medium hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
