import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  LayoutGrid,
  List as ListIcon,
  Plus,
  BrainCircuit,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import { sessionsApi, Session } from '@/api/sessions';
import { formatRelativeTime } from '@/lib/formatters';
import DeleteSessionDialog from '@/features/research/DeleteSessionDialog';
import { cn } from '@/lib/utils';

interface LandingSessionsWindowProps {
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  draft:    { label: 'Draft',    icon: <Clock size={11} />, className: 'text-[#A1A1AA] bg-white/[0.06] border-white/10' },
  active:   { label: 'Active',   icon: <Loader2 size={11} className="animate-spin text-[#E4E4E7]" />, className: 'text-[#E4E4E7] bg-[#E4E4E7]/15 border-[#E4E4E7]/25' },
  archived: { label: 'Archived', icon: <CheckCircle size={11} className="text-[#10B981]" />, className: 'text-[#10B981] bg-[#10B981]/15 border-[#10B981]/25' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    icon: <AlertCircle size={11} className="text-[#A1A1AA]" />,
    className: 'text-[#A1A1AA] bg-white/[0.06] border-white/10',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.className}`}>
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
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('scout_landing_sessions_view') as 'grid' | 'list') || 'grid';
  });

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('scout_landing_sessions_view', mode);
  };

  const { data: sessions, isLoading, isError, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.listSessions(),
  });

  const filteredSessions = (sessions || []).filter((s) => {
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
        'relative flex-1 min-h-0 w-full max-w-[980px] h-full max-h-[1000px] my-auto flex flex-col',
        // Liquid glass base
        'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
        'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
        'shadow-[var(--pill-shadow)]',
        'rounded-[34px] overflow-hidden',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'animate-in fade-in zoom-in-95 duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-white/[0.08] shrink-0 backdrop-blur-md select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] border border-transparent hover:border-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Explore</span>
          </button>

          <div className="h-4 w-px bg-white/10 shrink-0" />

          {/* Title & Count Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[#F4F4F5] tracking-tight truncate">
              Research Sessions
            </h2>
            {sessions && sessions.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 border border-white/12 text-[#A1A1AA]">
                {sessions.length}
              </span>
            )}
          </div>
        </div>

        {/* Controls: Search, View Toggle, New Chat */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-48 sm:flex-initial">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1 text-xs bg-white/[0.05] border border-white/10 hover:border-white/20 focus:border-[#E4E4E7]/60 rounded-full text-[#F4F4F5] placeholder-[#71717A] outline-none transition-all"
            />
          </div>

          {/* Grid / List View Toggle */}
          <div className="flex items-center p-0.5 rounded-full bg-white/[0.05] border border-white/10">
            <button
              type="button"
              onClick={() => handleViewChange('grid')}
              className={cn(
                'p-1.5 rounded-full transition-all cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-white/15 text-[#F4F4F5] shadow-xs'
                  : 'text-[#71717A] hover:text-[#F4F4F5]'
              )}
              title="Grid view"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              onClick={() => handleViewChange('list')}
              className={cn(
                'p-1.5 rounded-full transition-all cursor-pointer',
                viewMode === 'list'
                  ? 'bg-white/15 text-[#F4F4F5] shadow-xs'
                  : 'text-[#71717A] hover:text-[#F4F4F5]'
              )}
              title="List view"
            >
              <ListIcon size={13} />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-black bg-white hover:bg-[#F4F4F5] shadow-[0_2px_10px_rgba(255,255,255,0.15)] active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={13} />
            <span>New chat</span>
          </button>
        </div>
      </header>

      {/* ── CONTENT AREA ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 sidebar-scroll">
        {isLoading ? (
          /* Skeleton Loader */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] animate-pulse space-y-3"
              >
                <div className="h-4 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/5 rounded w-full" />
                <div className="h-3 bg-white/5 rounded w-4/5" />
                <div className="flex justify-between pt-2">
                  <div className="h-4 bg-white/10 rounded-full w-14" />
                  <div className="h-3 bg-white/5 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle size={32} className="text-[#EF4444] mb-2" />
            <p className="text-sm font-medium text-[#F4F4F5]">Failed to load research sessions</p>
            <p className="text-xs text-[#71717A] mt-1 mb-4">Check your network connection and retry</p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 rounded-full text-xs bg-white/10 hover:bg-white/15 text-[#F4F4F5] border border-white/10 transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3">
              <BrainCircuit size={22} className="text-[#E4E4E7]" />
            </div>
            <h3 className="text-sm font-semibold text-[#F4F4F5] mb-1">
              {searchQuery ? 'No matching sessions found' : 'No research sessions yet'}
            </h3>
            <p className="text-xs text-[#A1A1AA] max-w-sm mb-4 leading-relaxed">
              {searchQuery
                ? `No sessions match "${searchQuery}". Try a different search query.`
                : 'Start a research session from the Explore studio or by clicking New Chat.'}
            </p>
            {!searchQuery && (
              <button
                onClick={onNewChat}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-black bg-white hover:bg-[#F4F4F5] shadow-[0_2px_12px_rgba(255,255,255,0.18)] active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Start first research</span>
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* ── GRID VIEW (Glass Cards) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/20 transition-all duration-200 shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)] cursor-pointer active:scale-[0.99]"
              >
                <div>
                  {/* Card Title & Delete */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare
                        size={14}
                        className="text-[#E4E4E7] shrink-0 group-hover:scale-110 transition-transform"
                      />
                      <h3 className="text-xs sm:text-sm font-medium text-[#F4F4F5] group-hover:text-white transition-colors truncate">
                        {session.title || 'Untitled Session'}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete(session);
                      }}
                      title="Delete session"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.08] transition-all shrink-0 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Summary / Snippet */}
                  <p className="text-[11px] text-[#A1A1AA] leading-relaxed line-clamp-3 mb-3">
                    {session.session_summary ||
                      (session.mode === 'deep_research'
                        ? 'Autonomous multi-step deep research and synthesis.'
                        : 'Conversational grounded retrieval and research answers.')}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06] text-[10px] text-[#71717A]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={session.status} />
                    <span className="capitalize px-1.5 py-0.5 rounded-full bg-white/[0.04] text-[#A1A1AA] border border-white/[0.06]">
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
        ) : (
          /* ── LIST VIEW (Table/List rows) ── */
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/[0.06] text-[#71717A]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium">Mode</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last Active</th>
                  <th className="w-12 px-3 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className="hover:bg-white/[0.05] transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 max-w-[340px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare size={13} className="text-[#E4E4E7] shrink-0" />
                        <span className="font-medium text-[#F4F4F5] truncate">
                          {session.title || 'Untitled Session'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-[#A1A1AA]">
                      {session.mode.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-[#71717A] text-[11px] whitespace-nowrap">
                      {formatRelativeTime(session.last_activity_at)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete(session);
                        }}
                        title="Delete session"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.08] transition-all cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete session confirmation dialog */}
      <DeleteSessionDialog
        session={sessionToDelete}
        open={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onSuccess={() => {
          setSessionToDelete(null);
          refetch();
        }}
      />
    </div>
  );
}
