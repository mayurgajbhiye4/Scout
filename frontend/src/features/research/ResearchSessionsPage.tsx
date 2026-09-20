import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, BrainCircuit, Clock, CheckCircle, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { sessionsApi, Session } from '@/api/sessions';
import { formatRelativeTime } from '@/lib/formatters';
import { Button } from '@/components/ui/button';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  draft:      { label: 'Draft',      icon: <Clock size={13} />,        className: 'text-[#A1A1AA] bg-[#1C1C22]' },
  active:     { label: 'Active',     icon: <Loader2 size={13} className="animate-spin" />, className: 'text-[#38BDF8] bg-[#38BDF8]/10' },
  archived:   { label: 'Archived',   icon: <CheckCircle size={13} />,  className: 'text-[#10B981] bg-[#10B981]/10' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: <AlertCircle size={13} />, className: 'text-[#A1A1AA] bg-[#1C1C22]' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function ResearchSessionsPage() {
  const navigate = useNavigate();

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.listSessions(),
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">
            Research Sessions
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Your conversational RAG sessions and deep research threads.
          </p>
        </div>
        <Button 
          onClick={async () => {
            const newSession = await sessionsApi.createSession({ title: "New Session", mode: "ask", source_policy: "source_first" });
            navigate(`/sessions/${newSession.id}`);
          }}
          className="shrink-0 rounded-full px-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus size={16} />
          New Chat
        </Button>
      </div>

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
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                  Loading sessions…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-destructive">
                  Failed to load sessions.
                </td>
              </tr>
            ) : sessions?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center">
                  <BrainCircuit size={32} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">No sessions yet.</p>
                  <Button 
                    variant="outline" size="sm"
                    onClick={async () => {
                      const newSession = await sessionsApi.createSession({ title: "New Session", mode: "ask", source_policy: "source_first" });
                      navigate(`/sessions/${newSession.id}`);
                    }}
                  >
                    Start your first chat
                  </Button>
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
                        // setSessionToDelete(session);
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
    </div>
  );
}
