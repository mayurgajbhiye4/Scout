import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowLeft, FolderPlus, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/api/workspaces';
import WorkspaceCard from './WorkspaceCard';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  });

  return (
    <div className="animate-fade-in-up">
      {/* Back button */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mb-6 text-[#A1A1AA] hover:text-[#F4F4F5] group"
      >
        <Link to="/">
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Back to Home
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-[#F4F4F5] tracking-tight">Workspaces</h1>
            {workspaces && (
              <Badge variant="default">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                {workspaces.length} {workspaces.length === 1 ? 'Workspace' : 'Workspaces'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-[#A1A1AA]">
            Manage your research environments, deep explorations, and knowledge libraries.
          </p>
        </div>

        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="shrink-0 rounded-full px-5 shadow-[0_2px_10px_rgba(255,255,255,0.12)] hover:shadow-[0_4px_18px_rgba(255,255,255,0.22)] hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus size={16} />
          New Workspace
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[220px] p-5 bg-[#111114] rounded-2xl border border-[#27272A] flex flex-col gap-4"
            >
              <div className="flex justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[60%]" />
              <div className="flex gap-2 mt-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-24 mt-auto" />
            </div>
          ))}
        </div>
      ) : workspaces && workspaces.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {workspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 px-6 bg-[#111114] rounded-2xl border border-dashed border-[#27272A] hover:border-[#3F3F46] transition-colors text-center">
          <div className="w-14 h-14 rounded-full bg-[#17171C] border border-[#27272A] flex items-center justify-center text-[#F59E0B] mb-5 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
            <FolderPlus size={26} />
          </div>
          <h2 className="text-lg font-semibold text-[#F4F4F5] mb-2">No workspaces yet</h2>
          <p className="text-sm text-[#A1A1AA] max-w-sm mb-6">
            Create your first research workspace to start attaching knowledge sources, generating reports, and querying autonomous agents.
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-full px-6 shadow-[0_2px_10px_rgba(255,255,255,0.12)] hover:shadow-[0_4px_18px_rgba(255,255,255,0.22)]"
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
    </div>
  );
}
