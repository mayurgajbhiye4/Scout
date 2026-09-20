import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Plus, 
  BrainCircuit, 
  Clock, 
  CheckCircle, 
  Loader2, 
  AlertCircle, 
  Trash2, 
  LayoutGrid, 
  List as ListIcon 
} from 'lucide-react';
import { sessionsApi, Session } from '@/api/sessions';
import { formatRelativeTime } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import DeleteSessionDialog from './DeleteSessionDialog';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  draft:    { label: 'Draft',    icon: <Clock size={12} />, className: 'text-[#A1A1AA] bg-[#1C1C22]' },
  active:   { label: 'Active',   icon: <Loader2 size={12} className="animate-spin" />, className: 'text-[#38BDF8] bg-[#38BDF8]/10' },
  archived: { label: 'Archived', icon: <CheckCircle size={12} />, className: 'text-[#10B981] bg-[#10B981]/10' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: <AlertCircle size={12} />, className: 'text-[#A1A1AA] bg-[#1C1C22]' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function ResearchSessionsPage() {
  const navigate = useNavigate();
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('scout_sessions_view') as 'grid' | 'list') || 'grid';
  });

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('scout_sessions_view', mode);
  };

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.listSessions(),
  });

  const renderEmptyState = () => (
    <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
      <BrainCircuit size={36} className="mx-auto mb-3 text-muted-foreground opacity-60" />
      <h3 className="font-semibold text-foreground mb-1">No research sessions yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
        Start a new conversational session to explore topics, analyze sources, or run deep research.
      </p>
      <Button 
        onClick={async () => {
          const newSession = await sessionsApi.createSession({ title: "New Session", mode: "ask", source_policy: "source_first" });
          navigate(`/sessions/${newSession.id}`);
        }}
        className="rounded-full px-5 cursor-pointer shadow-sm hover:shadow-md"
      >
        <Plus size={15} />
        Start your first chat
      </Button>
    </div>
  );

  return (
    <div>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">
            Research Sessions
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Your conversational RAG sessions and deep research threads.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Grid / List Layout Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-card border border-border shadow-xs">
            <button
              type="button"
              onClick={() => handleViewChange('grid')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer active:scale-95 select-none",
                viewMode === 'grid'
                  ? "bg-muted text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewChange('list')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer active:scale-95 select-none",
                viewMode === 'list'
                  ? "bg-muted text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List view"
              aria-label="List view"
            >
              <ListIcon size={15} />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {/* New Chat Button */}
          <Button 
            onClick={async () => {
              const newSession = await sessionsApi.createSession({ title: "New Session", mode: "ask", source_policy: "source_first" });
              navigate(`/sessions/${newSession.id}`);
            }}
            className="rounded-full px-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-95"
          >
            <Plus size={16} />
            New Chat
          </Button>
        </div>
      </div>

      {/* ── GRID VIEW (Google Keep Masonry Style) ── */}
      {viewMode === 'grid' ? (
        isLoading ? (
          /* Variable length skeleton cards */
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
            {[140, 210, 160, 240, 180, 150].map((height, i) => (
              <div 
                key={i} 
                className="break-inside-avoid mb-4 rounded-2xl border border-border bg-card p-4.5 animate-pulse flex flex-col justify-between shadow-sm"
                style={{ minHeight: `${height}px` }}
              >
                <div className="space-y-2.5">
                  <div className="h-4 rounded bg-muted/70 w-3/4" />
                  <div className="h-3 rounded bg-muted/50 w-full" />
                  <div className="h-3 rounded bg-muted/50 w-4/5" />
                  {height > 180 && <div className="h-3 rounded bg-muted/40 w-2/3" />}
                </div>
                <div className="flex items-center justify-between pt-4 mt-auto border-t border-border/40">
                  <div className="h-5 rounded-full bg-muted/70 w-16" />
                  <div className="h-3 rounded bg-muted/60 w-14" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-destructive">
            Failed to load sessions. Please try again.
          </div>
        ) : sessions?.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
            {sessions?.map((session: Session) => (
              <div
                key={session.id}
                onClick={() => navigate(`/sessions/${session.id}`)}
                className="break-inside-avoid mb-4 rounded-2xl border border-border bg-card p-4.5 transition-all duration-200 hover:border-border-hover hover:shadow-md hover:-translate-y-0.5 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  {/* Card Title & Delete Button */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-foreground text-sm sm:text-[15px] leading-snug group-hover:text-primary transition-colors line-clamp-3">
                      {session.title}
                    </h3>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete(session);
                      }}
                      className="opacity-0 group-hover:opacity-100 sm:opacity-40 hover:!opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all duration-150 cursor-pointer shrink-0 -mr-1 -mt-1 active:scale-95"
                      title="Delete session"
                      aria-label={`Delete session: ${session.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Card Content Summary (Variable Length like Google Keep) */}
                  {session.session_summary ? (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6 whitespace-pre-line mb-3">
                      {session.session_summary}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 leading-relaxed italic mb-3">
                      {session.mode === 'deep_research'
                        ? 'Deep multi-step research synthesis session.'
                        : session.mode === 'search'
                        ? 'Web search and source exploration thread.'
                        : 'Interactive conversational RAG session with grounded retrieval.'}
                    </p>
                  )}
                </div>

                {/* Card Meta Footer */}
                <div className="pt-3 mt-1 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={session.status} />
                    <span className="capitalize text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {session.mode.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                    {formatRelativeTime(session.last_activity_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── LIST VIEW (Clean Table Style matching Sources Page) ── */
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Mode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Active</th>
                <th className="w-14 px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                /* Shimmer Skeleton Loading Rows */
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4 max-w-[380px]">
                        <div className="h-4 rounded-md bg-muted/60 w-[75%]" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 rounded-md bg-muted/60 w-16" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 rounded-full bg-muted/60 w-20" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="h-4 rounded-md bg-muted/60 w-24 ml-auto" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="h-7 w-7 rounded-lg bg-muted/60 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-destructive">
                    Failed to load sessions.
                  </td>
                </tr>
              ) : sessions?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    {renderEmptyState()}
                  </td>
                </tr>
              ) : (
                sessions?.map((session: Session) => (
                  <tr
                    key={session.id}
                    className="group hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    <td className="px-4 py-3.5 max-w-[380px]">
                      <span className="font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                        {session.title}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="capitalize text-muted-foreground">{session.mode.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(session.last_activity_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete(session);
                        }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground/60 hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all duration-150 cursor-pointer active:scale-95"
                        title="Delete session"
                        aria-label={`Delete session: ${session.title}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteSessionDialog
        session={sessionToDelete}
        open={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
      />
    </div>
  );
}