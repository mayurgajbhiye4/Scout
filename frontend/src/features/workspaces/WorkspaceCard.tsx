import { Link } from 'react-router-dom';
import { Database, BrainCircuit, ArrowRight, FolderKanban } from 'lucide-react';
import { WorkspaceListItem } from '@/api/workspaces';
import { formatRelativeTime } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface WorkspaceCardProps {
  workspace: WorkspaceListItem;
  layout?: 'list' | 'grid';
}

export default function WorkspaceCard({ workspace, layout = 'list' }: WorkspaceCardProps) {
  const relTime = formatRelativeTime(workspace.updated_at || workspace.created_at);

  if (layout === 'list') {
    return (
      <Link
        to={`/workspaces/${workspace.id}/research`}
        className={cn(
          'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:px-6 sm:py-4',
          'bg-card border border-border rounded-2xl no-underline shadow-sm',
          'transition-all duration-200 cubic-bezier(0.16,1,0.3,1)',
          'hover:-translate-y-0.5 hover:border-[#3F3F46] hover:bg-[#141418]',
          'hover:shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)]'
        )}
      >
        {/* Left Side: Icon & Title/Description */}
        <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-accent border border-border flex items-center justify-center shrink-0 group-hover:border-[#3F3F46] transition-colors">
            <FolderKanban size={18} className="text-[#818CF8]" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[1.05rem] text-card-foreground tracking-tight leading-snug group-hover:text-primary transition-colors break-words">
              {workspace.name}
            </h2>

            {workspace.description && (
              <p className="text-[0.84rem] text-muted-foreground leading-relaxed mt-1 line-clamp-2 max-w-2xl break-words">
                {workspace.description}
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Badges, Timestamp & Arrow */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-border/50">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" className="px-2.5 py-1 text-xs">
              <Database size={12} className="text-[#38BDF8]" />
              <span>{workspace.source_count} {workspace.source_count === 1 ? 'Source' : 'Sources'}</span>
            </Badge>
            <Badge variant="default" className="px-2.5 py-1 text-xs">
              <BrainCircuit size={12} className="text-[#10B981]" />
              <span>{workspace.research_count} {workspace.research_count === 1 ? 'Session' : 'Sessions'}</span>
            </Badge>
          </div>

          {relTime && (
            <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline-block min-w-[100px] text-right">
              Updated {relTime}
            </span>
          )}

          <div className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:bg-white/[0.05] transition-all shrink-0">
            <ArrowRight
              size={16}
              className="shrink-0 transition-transform duration-200 group-hover:translate-x-1"
            />
          </div>
        </div>
      </Link>
    );
  }

  // Grid layout (when user switches to grid)
  return (
    <Link
      to={`/workspaces/${workspace.id}/research`}
      className={cn(
        'group flex flex-col h-full bg-card border border-border rounded-2xl p-6 no-underline shadow-sm',
        'transition-all duration-[220ms] cubic-bezier(0.16,1,0.3,1)',
        'hover:-translate-y-1 hover:border-[#3F3F46] hover:shadow-[0_12px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.08)]'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-xl bg-accent border border-border flex items-center justify-center shrink-0 mt-0.5">
            <FolderKanban size={18} className="text-[#818CF8]" />
          </div>
          <h2 className="font-semibold text-[1.05rem] text-card-foreground tracking-tight leading-snug group-hover:text-primary transition-colors break-words line-clamp-2 flex-1">
            {workspace.name}
          </h2>
        </div>
        <ArrowRight
          size={16}
          className="text-muted-foreground shrink-0 mt-1.5 transition-all duration-200 group-hover:text-primary group-hover:translate-x-1"
        />
      </div>

      {/* Description */}
      <p className="text-[0.84rem] text-muted-foreground leading-relaxed line-clamp-3 mb-5 min-h-[42px] break-words">
        {workspace.description || 'No description provided.'}
      </p>

      {/* Stats badges */}
      <div className="flex gap-2 flex-wrap mb-4">
        <Badge variant="default">
          <Database size={12} className="text-[#38BDF8]" />
          {workspace.source_count} {workspace.source_count === 1 ? 'Source' : 'Sources'}
        </Badge>
        <Badge variant="default">
          <BrainCircuit size={12} className="text-[#10B981]" />
          {workspace.research_count} {workspace.research_count === 1 ? 'Session' : 'Sessions'}
        </Badge>
      </div>

      {/* Timestamp */}
      {relTime && (
        <p className="text-[0.75rem] text-muted-foreground mt-auto">Updated {relTime}</p>
      )}
    </Link>
  );
}
