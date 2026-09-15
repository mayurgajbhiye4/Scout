import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, BrainCircuit, Database } from 'lucide-react';
import { workspacesApi } from '@/api/workspaces';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/breadcrumb';

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading workspace...</p>;
  }

  if (error || !workspace) {
    return <p className="text-[#EF4444] text-sm">Failed to load workspace.</p>;
  }

  return (
    <div className="animate-fade-in-up">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Workspaces', href: '/dashboard' },
          { label: workspace.name },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">{workspace.name}</h1>
          {workspace.description && (
            <p className="text-muted-foreground text-sm max-w-2xl">{workspace.description}</p>
          )}
        </div>
        <Button
          asChild
          className="shrink-0 rounded-full px-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
          <Link to={`/workspaces/${workspace.id}/research/new`}>
            <Plus size={16} />
            New Research
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="flex flex-col gap-3 p-6 rounded-2xl hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2 text-[#818CF8]">
            <BrainCircuit size={22} />
            <h2 className="text-lg font-semibold text-card-foreground">Research Sessions</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            You have {workspace.research_count} active or completed research sessions.
          </p>
          <Button asChild variant="outline" className="mt-auto self-start rounded-full px-4 text-xs font-medium transition-all duration-200">
            <Link to={`/workspaces/${workspace.id}/research`}>View All Sessions</Link>
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 p-6 rounded-2xl hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2 text-[#38BDF8]">
            <Database size={22} />
            <h2 className="text-lg font-semibold text-card-foreground">Knowledge Sources</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {workspace.source_count} external sources and documents indexed for this workspace.
          </p>
          <Button asChild variant="outline" className="mt-auto self-start rounded-full px-4 text-xs font-medium transition-all duration-200">
            <Link to={`/workspaces/${workspace.id}/sources`}>Manage Sources</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
