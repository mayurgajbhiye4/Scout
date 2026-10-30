import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LayoutGrid, List as ListIcon, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { sessionsApi, type Session } from '@/api/sessions';
import { formatRelativeTime, formatSessionTitle, getSmartSessionFallbackSummary } from '@/lib/formatters';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { useRateLimit } from '@/lib/rateLimitManager';
import { cn } from '@/lib/utils';
import { introDelay, staggerDelay } from '@/lib/motion';

interface LandingSessionsWindowProps {
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

// Each page of older sessions staggers in from its own first card, not from the top of the list
const SESSIONS_WINDOW_PAGE_SIZE = 20;

const STATUS_META: Record<string, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: 'bg-[var(--ws-ink-faint)]' },
  active: { label: 'Active', dot: 'bg-[var(--ws-accent)]' },
  archived: { label: 'Archived', dot: 'bg-[var(--ws-line-strong)]' },
};

function SessionStatus({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, dot: 'bg-[var(--ws-ink-faint)]' };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Opens the session; its ::after covers the whole card or row so the entire surface is clickable. */
function OpenSessionButton({ session, onOpen, className }: { session: Session; onOpen: (id: string) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      title={formatSessionTitle(session.title)}
      className={cn('text-left outline-none after:absolute after:inset-0 cursor-pointer', className)}
    >
      {formatSessionTitle(session.title)}
    </button>
  );
}

function DeleteButton({ session, onDeleted }: { session: Session; onDeleted: () => void }) {
  return (
    <DeleteSessionPopover session={session} side="bottom" align="end" sideOffset={6} onSuccess={onDeleted}>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Delete ${formatSessionTitle(session.title)}`}
        title="Delete session"
        className="ui-press relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] opacity-100 hover:bg-[var(--ws-card-hover)] hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 cursor-pointer"
      >
        <Trash2 size={14} />
      </button>
    </DeleteSessionPopover>
  );
}

export default function LandingSessionsWindow({ onSelectSession, onNewChat }: LandingSessionsWindowProps) {
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const isSessionCreateLimited = isScopeRateLimited('sessions:create');
  const sessionCooldownSec = getScopeSecondsLeft('sessions:create');

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const contentSentinelRef = useRef<HTMLDivElement>(null);

  const {
    data: sessionsData,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['sessions'],
    queryFn: ({ pageParam = 0 }) =>
      sessionsApi.listSessions({ skip: pageParam, limit: SESSIONS_WINDOW_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < SESSIONS_WINDOW_PAGE_SIZE) {
        return undefined;
      }
      return allPages.length * SESSIONS_WINDOW_PAGE_SIZE;
    },
  });

  const sessions = useMemo(
    () => sessionsData?.pages.flatMap((page) => page) ?? [],
    [sessionsData]
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 100 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  useEffect(() => {
    const sentinel = contentSentinelRef.current;
    const container = contentScrollRef.current;
    if (!sentinel || !container || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: container, rootMargin: '60px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.title?.toLowerCase().includes(q) || s.session_summary?.toLowerCase().includes(q);
  });

  const countLabel = searchQuery.trim()
    ? `${filteredSessions.length} of ${sessions.length} match`
    : sessions.length === 1 ? '1 session' : `${sessions.length} sessions`;

  return (
    <div className="font-ui flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--ws-canvas)] text-[var(--ws-ink)]">
      <div ref={contentScrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto sidebar-scroll">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Toolbar */}
          <div className="ui-in-up flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Sessions</h1>
              {!isLoading && !isError && <p className="text-[13px] text-[var(--ws-ink-soft)] tabular-nums">{countLabel}</p>}
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-initial">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-ink-faint)]" />
                <input
                  type="search"
                  placeholder="Search sessions"
                  aria-label="Search sessions"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)] pl-9 pr-3 text-base text-[var(--ws-ink)] outline-none placeholder:text-[var(--ws-ink-faint)] focus:border-[var(--ws-accent)] focus:ring-2 focus:ring-[var(--ws-accent-wash)] sm:text-[13px]"
                />
              </div>

              <div role="group" aria-label="Layout" className="flex shrink-0 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)] p-0.5">
                {([['grid', LayoutGrid, 'Grid'], ['list', ListIcon, 'List']] as const).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    aria-pressed={viewMode === mode}
                    aria-label={`${label} layout`}
                    title={`${label} layout`}
                    className={cn(
                      'ui-press grid h-8 w-8 place-items-center rounded-[10px] cursor-pointer',
                      viewMode === mode
                        ? 'bg-[var(--ws-canvas)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-line)]'
                        : 'text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)]'
                    )}
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onNewChat}
                className={cn(
                  'ui-press flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-semibold cursor-pointer',
                  isSessionCreateLimited
                    ? 'border border-[var(--ws-danger)]/50 text-[var(--ws-danger)]'
                    : 'bg-[var(--ws-accent)] text-white hover:brightness-110'
                )}
              >
                <Plus size={16} />
                <span className="hidden xs:inline">New research</span>
                {isSessionCreateLimited && <span className="tabular-nums">{sessionCooldownSec}s</span>}
              </button>
            </div>
          </div>

          <ArcadeRateLimitBanner className="mt-4" />

          <div className="mt-5">
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading sessions">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="animate-pulse space-y-2.5 rounded-[14px] border border-[var(--ws-line)] bg-[var(--ws-card)] p-4">
                    <div className="h-3.5 w-3/4 rounded bg-[var(--ws-card-hover)]" />
                    <div className="h-3 w-full rounded bg-[var(--ws-card-hover)]" />
                    <div className="h-3 w-4/5 rounded bg-[var(--ws-card-hover)]" />
                    <div className="h-3 w-1/3 rounded bg-[var(--ws-card-hover)] pt-2" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className="ui-in-up py-16 text-center" style={introDelay(80)}>
                <p className="text-[15px] font-semibold">Sessions couldn't be loaded</p>
                <p className="mt-1 text-[13px] text-[var(--ws-ink-soft)]">Check your connection, then try again.</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="ui-press mt-4 h-9 rounded-[12px] border border-[var(--ws-line)] px-4 text-[13px] font-medium hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
                >
                  Try again
                </button>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="ui-in-up py-16 text-center" style={introDelay(80)}>
                <p className="text-[15px] font-semibold">
                  {searchQuery ? `No sessions match “${searchQuery}”` : 'No sessions yet'}
                </p>
                <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-[var(--ws-ink-soft)]">
                  {searchQuery ? 'Try another word from the title or summary.' : 'Ask a question on the Explore page and it is saved here as a session.'}
                </p>
                <button
                  type="button"
                  onClick={searchQuery ? () => setSearchQuery('') : onNewChat}
                  className="ui-press mt-4 h-9 rounded-[12px] border border-[var(--ws-line)] px-4 text-[13px] font-medium hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
                >
                  {searchQuery ? 'Clear search' : 'New research'}
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSessions.map((session, idx) => (
                  <li
                    key={session.id}
                    style={staggerDelay(idx % SESSIONS_WINDOW_PAGE_SIZE, 80)}
                    className="ui-in-card group relative flex flex-col rounded-[14px] border border-[var(--ws-line)] bg-[var(--ws-card)] p-4 transition-colors hover:border-[var(--ws-line-strong)] focus-within:border-[var(--ws-accent)] focus-within:ring-2 focus-within:ring-[var(--ws-accent-wash)]"
                  >
                    <div className="flex items-start gap-2">
                      <h2 className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">
                        <OpenSessionButton session={session} onOpen={onSelectSession} className="line-clamp-2 after:rounded-[14px]" />
                      </h2>
                      <DeleteButton session={session} onDeleted={() => refetch()} />
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">
                      {session.session_summary || getSmartSessionFallbackSummary(session)}
                    </p>
                    <div className="mt-auto flex items-center gap-3 pt-4 text-[12px] text-[var(--ws-ink-faint)]">
                      <SessionStatus status={session.status} />
                      <span>{formatRelativeTime(session.last_activity_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="overflow-hidden rounded-[14px] border border-[var(--ws-line)] bg-[var(--ws-card)] divide-y divide-[var(--ws-line)]">
                {filteredSessions.map((session, idx) => (
                  <li
                    key={session.id}
                    style={staggerDelay(idx % SESSIONS_WINDOW_PAGE_SIZE, 80)}
                    className="ui-in-up group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--ws-card-hover)] focus-within:bg-[var(--ws-card-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[14px] font-semibold">
                        <OpenSessionButton session={session} onOpen={onSelectSession} />
                      </h2>
                      <p className="truncate text-[13px] text-[var(--ws-ink-soft)]">
                        {session.session_summary || getSmartSessionFallbackSummary(session)}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-[12px] text-[var(--ws-ink-faint)] sm:inline-flex">
                      <SessionStatus status={session.status} />
                    </span>
                    <span className="w-20 shrink-0 text-right text-[12px] text-[var(--ws-ink-faint)]">
                      {formatRelativeTime(session.last_activity_at)}
                    </span>
                    <DeleteButton session={session} onDeleted={() => refetch()} />
                  </li>
                ))}
              </ul>
            )}

            {/* Infinite scroll sentinel & indicator */}
            <div ref={contentSentinelRef} className="pointer-events-none mt-2 h-1 w-full" />
            {isFetchingNextPage && (
              <div className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-[var(--ws-ink-faint)]">
                <Loader2 size={14} className="animate-spin" />
                Loading older sessions
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
