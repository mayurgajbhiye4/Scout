import { Link } from 'react-router-dom';
import { Database, BrainCircuit, ArrowRight, FolderKanban } from 'lucide-react';
import { WorkspaceListItem } from '@/api/workspaces';
import { formatRelativeTime } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface WorkspaceCardProps {
  workspace: WorkspaceListItem;
}

export default function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <Link
      to={`/workspaces/${workspace.id}`}
      className={cn(
        'group flex flex-col h-full bg-card border border-border rounded-2xl p-5 no-underline shadow-sm',
        'transition-all duration-[220ms] cubic-bezier(0.16,1,0.3,1)',
        'hover:-translate-y-1 hover:border-[#3F3F46] hover:shadow-[0_12px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.08)]'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-accent border border-border flex items-center justify-center shrink-0">
            <FolderKanban size={16} className="text-[#818CF8]" />
          </div>
          <h2 className="font-semibold text-[1.05rem] text-card-foreground tracking-tight leading-tight group-hover:text-primary transition-colors line-clamp-1">
            {workspace.name}
          </h2>
        </div>
        <ArrowRight
          size={16}
          className="text-muted-foreground shrink-0 transition-all duration-200 group-hover:text-primary group-hover:translate-x-1"
        />
      </div>

      {/* Description */}
      <p className="text-[0.8125rem] text-muted-foreground leading-relaxed line-clamp-2 mb-4 min-h-[38px]">
        {workspace.description || 'No description provided.'}
      </p>

      {/* Stats badges */}
      <div className="flex gap-2 flex-wrap mb-4">
        <Badge variant="default">
          <Database size={11} className="text-[#38BDF8]" />
          {workspace.source_count} Sources
        </Badge>
        <Badge variant="default">
          <BrainCircuit size={11} className="text-[#10B981]" />
          {workspace.research_count} Sessions
        </Badge>
      </div>

      {/* Timestamp */}
      {(() => {
        const relTime = formatRelativeTime(workspace.updated_at || workspace.created_at);
        return relTime ? (
          <p className="text-[0.725rem] text-muted-foreground mt-auto">Updated {relTime}</p>
        ) : null;
      })()}
    </Link>
  );
}
