import { useState } from 'react';
import { Plus, FolderPlus, Sparkles, LayoutList, LayoutGrid } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi, WorkspaceListItem } from '@/api/workspaces';
import WorkspaceCard from './WorkspaceCard';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';
import DeleteWorkspaceDialog from './DeleteWorkspaceDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<WorkspaceListItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('scout_workspaces_view') as 'list' | 'grid') || 'list';
  });

  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('scout_workspaces_view', mode);
  };

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  });

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Workspaces</h1>
            {workspaces && (
              <Badge variant="default">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                {workspaces.length} {workspaces.length === 1 ? 'Workspace' : 'Workspaces'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your research environments, deep explorations, and knowledge libraries.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          {workspaces && workspaces.length > 0 && (
            <div className="flex items-center p-1 rounded-xl bg-accent/60 border border-border">
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none',
                  viewMode === 'list'
                    ? 'bg-white/[0.12] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="List view"
                aria-label="List view"
              >
                <LayoutList size={14} />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('grid')}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none',
                  viewMode === 'grid'
                    ? 'bg-white/[0.12] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Grid view"
                aria-label="Grid view"
              >
                <LayoutGrid size={14} />
                <span>Grid</span>
              </button>
            </div>
          )}

          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="shrink-0 rounded-full px-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus size={16} />
            New Workspace
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === 'list' ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-5 bg-card rounded-2xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                  <div className="space-y-2 flex-1 max-w-md">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-72" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-3 w-20 hidden md:block" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[230px] p-6 bg-card rounded-2xl border border-border flex flex-col gap-4 shadow-sm"
              >
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[60%]" />
                <div className="flex gap-2 mt-auto">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        )
      ) : workspaces && workspaces.length > 0 ? (
        viewMode === 'list' ? (
          <div className="flex flex-col gap-3">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                layout="list"
                onDelete={setWorkspaceToDelete}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                layout="grid"
                onDelete={setWorkspaceToDelete}
              />
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-24 px-6 bg-card rounded-2xl border border-dashed border-border hover:border-muted-foreground/40 transition-colors text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-accent border border-border flex items-center justify-center text-[#F59E0B] mb-5 shadow-sm">
            <FolderPlus size={26} />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No workspaces yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Create your first research workspace to start attaching knowledge sources, generating reports, and querying autonomous agents.
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-full px-6 shadow-sm hover:shadow-md"
          >
            <Sparkles size={16} />
            Create Your First Workspace
          </Button>
        </div>
      )}

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      <DeleteWorkspaceDialog
        open={!!workspaceToDelete}
        workspace={workspaceToDelete}
        onClose={() => setWorkspaceToDelete(null)}
      />
    </div>
  );
}
