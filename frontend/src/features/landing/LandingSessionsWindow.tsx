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
} from 'lucide-react';
import { sessionsApi } from '@/api/sessions';
import { formatRelativeTime, formatSessionTitle, getSmartSessionFallbackSummary } from '@/lib/formatters';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import { cn } from '@/lib/utils';

interface LandingSessionsWindowProps {
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  draft:    { label: 'Draft',    icon: <Clock size={11} />, className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]' },
  active:   { label: 'Active',   icon: <Loader2 size={11} className="animate-spin text-[#3b82f6]" />, className: 'text-[#3b82f6] bg-[#2563eb]/10 border-[#2563eb]/25' },
  archived: { label: 'Archived', icon: <CheckCircle size={11} className="text-[#10b981]" />, className: 'text-[#10b981] bg-[#10b981]/10 border-[#10b981]/25' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    icon: <AlertCircle size={11} className="text-[#a1a1aa]" />,
    className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-medium border ${cfg.className}`}>
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
  const [searchQuery, setSearchQuery] = useState('');

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
        'bg-[#0d0d0f] rounded-none border-none overflow-hidden',
        'transition-all duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[#27272a] bg-[#141416] shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium text-[#a1a1aa] hover:text-[#f4f4f5] bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-[#3f3f46] transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft size={14} className="text-[#3b82f6]" />
            <span className="hidden sm:inline">Explore</span>
          </button>

          <div className="h-4 w-px bg-[#27272a] shrink-0" />

          {/* Title & Count Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[#f4f4f5] tracking-tight truncate">
              Research Sessions
            </h2>
            {sessions && sessions.length > 0 && (
              <span className="px-2 py-0.5 rounded-none text-[11px] font-medium bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
                {sessions.length}
              </span>
            )}
          </div>
        </div>

        {/* Controls: Search, View Toggle, New Chat */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-52 sm:flex-initial">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717a] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-[#18181b] border border-[#27272a] focus:border-[#2563eb] rounded-none text-[#f4f4f5] placeholder-[#71717a] outline-none transition-colors"
            />
          </div>


          {/* New Chat Button */}
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>New chat</span>
          </button>
        </div>
      </header>

      {/* ── CONTENT AREA ── */}
      <div
        ref={contentScrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 sidebar-scroll"
      >
        <div className="max-w-6xl mx-auto w-full">
          {isLoading ? (
            /* Skeleton Loader */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-none bg-[#141416] border border-[#27272a] animate-pulse space-y-3"
                >
                  <div className="h-4 bg-[#27272a] rounded-none w-3/4" />
                  <div className="h-3 bg-[#202024] rounded-none w-full" />
                  <div className="h-3 bg-[#202024] rounded-none w-4/5" />
                  <div className="flex justify-between pt-2">
                    <div className="h-4 bg-[#27272a] rounded-none w-14" />
                    <div className="h-3 bg-[#202024] rounded-none w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle size={32} className="text-[#ef4444] mb-2" />
              <p className="text-sm font-medium text-[#f4f4f5]">Failed to load research sessions</p>
              <p className="text-xs text-[#71717a] mt-1 mb-4">Check your network connection and retry</p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded-none text-xs bg-[#18181b] hover:bg-[#202024] text-[#f4f4f5] border border-[#27272a] transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-3">
                <BrainCircuit size={22} className="text-[#3b82f6]" />
              </div>
              <h3 className="text-sm font-semibold text-[#f4f4f5] mb-1">
                {searchQuery ? 'No matching sessions found' : 'No research sessions yet'}
              </h3>
              <p className="text-xs text-[#a1a1aa] max-w-sm mb-4 leading-relaxed">
                {searchQuery
                  ? `No sessions match "${searchQuery}". Try a different search query.`
                  : 'Start a research session from the Explore studio or by clicking New Chat.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={onNewChat}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-none text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Start first research</span>
                </button>
              )}
            </div>
          ) : (
            /* ── GRID VIEW (Solid Cards) ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="group relative flex flex-col justify-between p-4 rounded-none bg-[#141416] hover:bg-[#18181b] border border-[#27272a] hover:border-[#2563eb] transition-colors cursor-pointer"
                >
                  <div>
                    {/* Card Title & Delete */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0" title={formatSessionTitle(session.title)}>
                        <MessageSquare
                          size={14}
                          className="text-[#3b82f6] shrink-0"
                        />
                        <h3 className="text-xs sm:text-sm font-medium text-[#f4f4f5] group-hover:text-white transition-colors truncate">
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
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-none text-[#71717a] hover:text-[#ef4444] hover:bg-[#202024] transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </DeleteSessionPopover>
                    </div>

                    {/* Summary / Snippet */}
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed line-clamp-3 mb-3">
                      {session.session_summary || getSmartSessionFallbackSummary(session)}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-[#27272a] text-[10px] text-[#71717a]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={session.status} />
                      <span className="capitalize px-1.5 py-0.5 rounded-none bg-[#18181b] text-[#a1a1aa] border border-[#27272a]">
                        {session.mode.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="shrink-0">
                      {formatRelativeTime(session.last_activity_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel & indicators */}
          <div ref={contentSentinelRef} className="h-1 w-full pointer-events-none mt-2" />
          {isFetchingNextPage && (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-[#a1a1aa]">
              <Loader2 size={14} className="animate-spin text-[#2563eb]" />
              <span>Loading older research sessions...</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
