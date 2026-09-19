import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, BrainCircuit, Clock, CheckCircle, XCircle, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { researchApi, ResearchSession } from '@/api/research';
import { workspacesApi } from '@/api/workspaces';
import { formatRelativeTime } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import DeleteResearchDialog from './DeleteResearchDialog';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  queued:      { label: 'Queued',      icon: <Clock size={13} />,        className: 'text-[#A1A1AA] bg-[#1C1C22]' },
  planning:    { label: 'Planning',    icon: <Loader2 size={13} className="animate-spin" />, className: 'text-[#FBBF24] bg-[#FBBF24]/10' },
  researching: { label: 'Researching', icon: <Loader2 size={13} className="animate-spin" />, className: 'text-[#38BDF8] bg-[#38BDF8]/10' },
  finalizing:  { label: 'Finalizing',  icon: <Loader2 size={13} className="animate-spin" />, className: 'text-[#818CF8] bg-[#818CF8]/10' },
  completed:   { label: 'Completed',   icon: <CheckCircle size={13} />,  className: 'text-[#10B981] bg-[#10B981]/10' },
  failed:      { label: 'Failed',      icon: <XCircle size={13} />,      className: 'text-[#EF4444] bg-[#EF4444]/10' },
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
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [sessionToDelete, setSessionToDelete] = useState<ResearchSession | null>(null);

  const { data: workspace } = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['research', workspaceId],
    queryFn: () => researchApi.listSessions(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      // Keep polling while any session is in-progress
      const data = query.state.data as ResearchSession[] | undefined;
      const hasActive = data?.some(s => ['queued', 'planning', 'researching', 'finalizing'].includes(s.status));
      return hasActive ? 5000 : false;
    },
  });

  return (
    <div>
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Workspaces', href: '/dashboard' },
          { label: workspace?.name || 'Workspace' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">
            {workspace?.name || 'Research Sessions'}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {workspace?.description || 'Autonomous deep research runs and their generated reports.'}
          </p>
        </div>
        <Link to={`/workspaces/${workspaceId}/research/new`}>
          <Button className="shrink-0 rounded-full px-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <Plus size={16} />
            New Research
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Question</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Depth</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
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
                  Failed to load research sessions.
                </td>
              </tr>
            ) : sessions?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center">
                  <BrainCircuit size={32} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">No research sessions yet.</p>
                  <Link to={`/workspaces/${workspaceId}/research/new`}>
                    <Button variant="outline" size="sm">Start your first research</Button>
                  </Link>
                </td>
              </tr>
            ) : (
              sessions?.map((session: ResearchSession) => (
                <tr
                  key={session.id}
                  className="group hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    const path = session.status === 'completed'
                      ? `/workspaces/${workspaceId}/research/${session.id}/report`
                      : `/workspaces/${workspaceId}/research/${session.id}`;
                    navigate(path);
                  }}
                >
                  <td className="px-4 py-3.5 max-w-[380px]">
                    <span className="font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {session.question}
                    </span>
                    {session.error_message && (
                      <span className="block text-xs text-destructive mt-1 truncate">{session.error_message}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="capitalize text-muted-foreground">{session.research_depth}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(session.created_at)}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete(session);
                      }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground/60 hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all duration-150 cursor-pointer active:scale-95"
                      title="Delete research session"
                      aria-label={`Delete research session: ${session.question}`}
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

      <DeleteResearchDialog
        workspaceId={workspaceId!}
        session={sessionToDelete}
        open={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
      />
    </div>
  );
}
