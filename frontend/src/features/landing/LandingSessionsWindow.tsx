import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  Plus,
  BrainCircuit,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  MessageSquare,
  LayoutGrid,
  List as ListIcon,
} from '@/components/icons';
import { sessionsApi } from '@/api/sessions';
import { formatRelativeTime, formatSessionTitle, getSmartSessionFallbackSummary } from '@/lib/formatters';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { useRateLimit } from '@/lib/rateLimitManager';
import { cn } from '@/lib/utils';

interface LandingSessionsWindowProps {
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  draft: { label: 'Draft', icon: <Clock size={11} />, className: 'text-slate-600 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#18181b] border-slate-200 dark:border-[#27272a]' },
  active: { label: 'Active', icon: <Loader2 size={11} className="animate-spin text-primary" />, className: 'text-primary bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/25' },
  archived: { label: 'Archived', icon: <CheckCircle size={11} className="text-teal-600 dark:text-[#14b8a6]" />, className: 'text-teal-600 dark:text-[#14b8a6] bg-teal-50 dark:bg-[#14b8a6]/10 border-teal-200 dark:border-[#14b8a6]/25' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    icon: <AlertCircle size={11} className="text-slate-500 dark:text-[#a1a1aa]" />,
    className: 'text-slate-600 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#18181b] border-slate-200 dark:border-[#27272a]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function LandingSessionsWindow({
  onSelectSession,
  onClose,
  onNewChat,
}: LandingSessionsWindowProps) {
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const isSessionCreateLimited = isScopeRateLimited('sessions:create');
  const sessionCooldownSec = getScopeSecondsLeft('sessions:create');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'research' | 'ask'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const contentSentinelRef = useRef<HTMLDivElement>(null);

  const SESSIONS_WINDOW_PAGE_SIZE = 20;

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
    if (filterMode !== 'all') {
      const isResearch = s.mode === 'research' || s.mode === 'deep_research';
      if (filterMode === 'research' && !isResearch) return false;
      if (filterMode === 'ask' && isResearch) return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.session_summary?.toLowerCase().includes(q) ||
      s.mode?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 w-full h-full flex flex-col',
        'bg-[var(--bg)] border-none overflow-hidden',
        'transition-all duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 px-3.5 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200 dark:border-[#27272a] bg-white/90 dark:bg-[#141416]/90 backdrop-blur-md shrink-0 select-none">
        <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto">
          {/* Back to Explore */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] hover:border-slate-300 dark:hover:border-[#3f3f46] transition-colors cursor-pointer shrink-0 active:scale-95"
          >
            <ArrowLeft size={14} className="text-primary" />
            <span>Explore</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-[#27272a] shrink-0" />

          {/* Title & Count Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-[#f4f4f5] tracking-tight truncate">
              Research Sessions
            </h2>
            {sessions && sessions.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-[#a1a1aa] shrink-0">
                {filteredSessions.length}
              </span>
            )}
          </div>
        </div>

        {/* Controls: Mode Filter Pills, Search, New Chat */}
        <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto flex-wrap">
          {/* Mode Filter Pills */}
          <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shrink-0">
            {(['all', 'research', 'ask'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFilterMode(m)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap active:scale-95",
                  filterMode === m
                    ? "bg-primary text-white font-semibold shadow-sm"
                    : "text-slate-600 dark:text-[#71717a] hover:text-slate-900 dark:hover:text-[#f4f4f5]"
                )}
              >
                {m === 'all' ? 'All' : m === 'research' ? 'Deep Research' : 'Quick Ask'}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-52 sm:flex-initial">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#71717a] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-base sm:text-xs bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] focus:border-primary rounded-full text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder-[#71717a] outline-none transition-colors"
            />
          </div>

          {/* Grid / List Switcher */}
          <div className="flex items-center p-1 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1.5 rounded-full transition-colors cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 dark:text-[#71717a] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
              )}
              title="Grid view"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded-full transition-colors cursor-pointer',
                viewMode === 'list'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 dark:text-[#71717a] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
              )}
              title="List view"
            >
              <ListIcon size={13} />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            onClick={onNewChat}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 active:scale-95",
              isSessionCreateLimited
                ? "bg-amber-100 dark:bg-[#f59e0b]/20 text-amber-800 dark:text-[#fbbf24] border border-amber-300 dark:border-[#f59e0b]/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                : "text-white bg-primary hover:bg-primary/90"
            )}
          >
            <Plus size={13} className={isSessionCreateLimited ? "text-amber-700 dark:text-[#f59e0b]" : "text-white"} />
            <span>New chat</span>
            {isSessionCreateLimited && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200 dark:bg-[#f59e0b]/30 border border-amber-300 dark:border-[#f59e0b]/60 text-amber-800 dark:text-[#fbbf24] font-bold ml-1 animate-pulse">
                {sessionCooldownSec}s
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── ARCADE RATE LIMIT WARNING BANNER ── */}
      <ArcadeRateLimitBanner className="border-b border-slate-200 dark:border-[#27272a]" />

      {/* ── CONTENT AREA ── */}
      <div
        ref={contentScrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-6 sidebar-scroll"
      >
        <div className="max-w-6xl mx-auto w-full">
          {isLoading ? (
            /* Skeleton Loader */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="p-5 sm:p-6 rounded-[32px] sm:rounded-[36px] bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] animate-pulse space-y-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#27272a]" />
                    <div className="h-4 bg-slate-100 dark:bg-[#27272a] rounded-full w-14" />
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-[#27272a] rounded-full w-3/4" />
                  <div className="h-3 bg-slate-50 dark:bg-[#202024] rounded-full w-full" />
                  <div className="h-3 bg-slate-50 dark:bg-[#202024] rounded-full w-4/5" />
                  <div className="flex justify-between pt-2">
                    <div className="h-4 bg-slate-100 dark:bg-[#27272a] rounded-full w-16" />
                    <div className="h-3 bg-slate-50 dark:bg-[#202024] rounded-full w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle size={32} className="text-red-500 mb-2" />
              <p className="text-sm font-medium text-slate-800 dark:text-[#f4f4f5]">Failed to load research sessions</p>
              <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1 mb-4">Check your network connection and retry</p>
              <button
                onClick={() => refetch()}
                className="px-3.5 py-1.5 rounded-full text-xs bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-800 dark:text-[#f4f4f5] border border-slate-200 dark:border-[#27272a] transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] flex items-center justify-center mb-3">
                <BrainCircuit size={22} className="text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f4f4f5] mb-1">
                {searchQuery ? 'No matching sessions found' : 'No research sessions yet'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#a1a1aa] max-w-sm mb-4 leading-relaxed">
                {searchQuery
                  ? `No sessions match "${searchQuery}". Try a different search query.`
                  : 'Start a research session from the Explore studio or by clicking New Chat.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={onNewChat}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Start first research</span>
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* ── GRID VIEW (Pill-Shaped Dossiers) ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="group relative flex flex-col justify-between p-5 sm:p-6 rounded-[32px] sm:rounded-[36px] bg-white dark:bg-[#141416] hover:bg-slate-50 dark:hover:bg-[#18181b] active:bg-slate-100 dark:active:bg-[#1a1a20] border border-slate-200 dark:border-[#27272a] hover:border-primary shadow-sm hover:shadow-md transition-all cursor-pointer select-none active:scale-[0.99]"
                >
                  <div>
                    {/* Card Title & Delete */}
                    <div className="flex items-start justify-between gap-2.5 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0" title={formatSessionTitle(session.title)}>
                        <div className="w-9 h-9 rounded-full bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 flex items-center justify-center shrink-0 group-hover:bg-teal-100 dark:group-hover:bg-teal-500/20 transition-colors">
                          <MessageSquare
                            size={14}
                            className="text-primary"
                          />
                        </div>
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-[#f4f4f5] group-hover:text-primary dark:group-hover:text-white transition-colors truncate">
                          {formatSessionTitle(session.title)}
                        </h3>
                      </div>

                      <DeleteSessionPopover
                        session={session}
                        side="bottom"
                        align="end"
                        sideOffset={6}
                        onSuccess={() => {
                          refetch();
                        }}
                      >
                        <button
                          type="button"
                          title="Delete session"
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-full text-slate-400 dark:text-[#71717a] hover:text-red-500 dark:hover:text-[#ef4444] hover:bg-slate-100 dark:hover:bg-[#202024] transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </DeleteSessionPopover>
                    </div>

                    {/* Summary / Snippet */}
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-[#a1a1aa] leading-relaxed line-clamp-3 mb-3.5">
                      {session.session_summary || getSmartSessionFallbackSummary(session)}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#27272a] text-[10px] text-slate-500 dark:text-[#71717a] gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={session.status} />
                      <span className="capitalize px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181b] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a] font-mono">
                        {session.mode.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
                        {formatRelativeTime(session.last_activity_at)}
                      </span>
                      <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold text-primary bg-teal-50 dark:bg-teal-500/10 group-hover:bg-teal-100 dark:group-hover:bg-teal-500/20 border border-teal-200 dark:border-teal-500/30 group-hover:border-primary transition-colors shadow-sm">
                        <span>Open</span>
                        <ArrowLeft size={10} className="rotate-180 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── LIST VIEW (Horizontal Pill Dossiers) ── */
            <div className="space-y-2.5">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="group relative flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 rounded-full bg-white dark:bg-[#141416] hover:bg-slate-50 dark:hover:bg-[#18181b] active:bg-slate-100 dark:active:bg-[#1a1a20] border border-slate-200 dark:border-[#27272a] hover:border-primary shadow-sm hover:shadow-md transition-all cursor-pointer select-none active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 flex items-center justify-center shrink-0 group-hover:bg-teal-100 dark:group-hover:bg-teal-500/20 transition-colors">
                      <MessageSquare size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1 pr-2">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-[#f4f4f5] group-hover:text-primary dark:group-hover:text-white transition-colors truncate">
                        {formatSessionTitle(session.title)}
                      </h3>
                      <p className="text-[11px] text-slate-600 dark:text-[#a1a1aa] truncate mt-0.5">
                        {session.session_summary || getSmartSessionFallbackSummary(session)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="hidden sm:flex items-center gap-1.5">
                      <StatusBadge status={session.status} />
                      <span className="capitalize px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181b] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a] text-[10px] font-mono">
                        {session.mode.replace('_', ' ')}
                      </span>
                    </div>

                    <span className="shrink-0 font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a]">
                      {formatRelativeTime(session.last_activity_at)}
                    </span>

                    <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold text-primary bg-teal-50 dark:bg-teal-500/10 group-hover:bg-teal-100 dark:group-hover:bg-teal-500/20 border border-teal-200 dark:border-teal-500/30 group-hover:border-primary transition-colors shadow-sm">
                      <span>Open</span>
                      <ArrowLeft size={10} className="rotate-180 group-hover:translate-x-0.5 transition-transform" />
                    </div>

                    <DeleteSessionPopover
                      session={session}
                      side="bottom"
                      align="end"
                      sideOffset={6}
                      onSuccess={() => {
                        refetch();
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        title="Delete session"
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-full text-slate-400 dark:text-[#71717a] hover:text-red-500 dark:hover:text-[#ef4444] hover:bg-slate-100 dark:hover:bg-[#202024] transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </DeleteSessionPopover>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel & indicators */}
          <div ref={contentSentinelRef} className="h-1 w-full pointer-events-none mt-2" />
          {isFetchingNextPage && (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-[#a1a1aa]">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span>Loading older research sessions...</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
