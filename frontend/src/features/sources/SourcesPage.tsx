import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Link as LinkIcon, FileText, Globe, Trash2 } from 'lucide-react';
import { sourcesApi, Source } from '@/api/sources';
import AddSourceDialog from './AddSourceDialog';
import DeleteSourceDialog from './DeleteSourceDialog';
import { formatRelativeTime } from '@/lib/formatters';
import { Button } from '@/components/ui/button';

export default function SourcesPage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => sourcesApi.listSources(),
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground">Manage external context and documents available to the AI.</p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="shrink-0 rounded-full px-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
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
              <th className="w-14 px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading sources...</td>
              </tr>
            ) : sources?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
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
                    <span className="flex items-center">{getSourceIcon(source.source_type)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{source.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    {source.canonical_uri ? (
                      <a
                        href={source.canonical_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#818CF8] hover:underline text-sm"
                      >
                        {source.canonical_uri.length > 50 ? source.canonical_uri.substring(0, 50) + '...' : source.canonical_uri}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(source.created_at) || '-'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSourceToDelete(source);
                      }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground/60 hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all duration-150 cursor-pointer active:scale-95"
                      title="Delete source"
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

      <AddSourceDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />

      <DeleteSourceDialog
        source={sourceToDelete}
        open={!!sourceToDelete}
        onClose={() => setSourceToDelete(null)}
      />
    </div>
  );
}

