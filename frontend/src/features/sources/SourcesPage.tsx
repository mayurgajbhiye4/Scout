import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Link as LinkIcon, FileText, Globe } from 'lucide-react';
import { sourcesApi, Source } from '@/api/sources';
import { workspacesApi } from '@/api/workspaces';
import AddSourceDialog from './AddSourceDialog';
import { formatRelativeTime } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';

export default function SourcesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: workspace } = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources', workspaceId],
    queryFn: () => sourcesApi.listSources(workspaceId!),
    enabled: !!workspaceId,
  });

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'url': return <LinkIcon size={15} className="text-[#38BDF8]" />;
      case 'web': return <Globe size={15} className="text-[#10B981]" />;
      default: return <FileText size={15} className="text-[#A1A1AA]" />;
    }
  };

  return (
    <div>
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Workspaces', href: '/dashboard' },
          { label: workspace?.name || 'Workspace', href: `/workspaces/${workspaceId}` },
          { label: 'Knowledge Sources' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground">Manage external context and documents available to the AI.</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="shrink-0">
          <Plus size={16} />
          Add Source
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="w-10 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">URL / Path</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading sources...</td>
              </tr>
            ) : sources?.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center">
                  <p className="text-muted-foreground mb-3">No sources added yet.</p>
                  <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
                    Add your first source
                  </Button>
                </td>
              </tr>
            ) : (
              sources?.map((source: Source) => (
                <tr key={source.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="flex items-center">{getSourceIcon(source.type)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{source.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#818CF8] hover:underline text-sm"
                      >
                        {source.url.length > 50 ? source.url.substring(0, 50) + '...' : source.url}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(source.created_at) || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddSourceDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        workspaceId={workspaceId!}
      />
    </div>
  );
}
