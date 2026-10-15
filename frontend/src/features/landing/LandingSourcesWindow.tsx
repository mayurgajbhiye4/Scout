import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Database,
  Link as LinkIcon,
  FileText,
  Globe,
  Github,
  Youtube,
  Trash2,
  ExternalLink,
  X,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { sourcesApi, Source } from '@/api/sources';
import { formatRelativeTime, normalizeSourceTitle } from '@/lib/formatters';
import AddSourceDialog from '@/features/sources/AddSourceDialog';
import DeleteSourceDialog from '@/features/sources/DeleteSourceDialog';
import { cn } from '@/lib/utils';

interface LandingSourcesWindowProps {
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  ready:      { label: 'Indexed',    icon: <CheckCircle size={11} className="text-[#10b981]" />, className: 'text-[#10b981] bg-[#10b981]/10 border-[#10b981]/25' },
  processing: { label: 'Indexing',   icon: <Loader2 size={11} className="animate-spin text-[#3b82f6]" />, className: 'text-[#3b82f6] bg-[#2563eb]/10 border-[#2563eb]/25' },
  pending:    { label: 'Queued',     icon: <Clock size={11} />, className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]' },
  failed:     { label: 'Failed',     icon: <AlertCircle size={11} className="text-[#ef4444]" />, className: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/25' },
};

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status || 'ready'] ?? {
    label: status || 'Ready',
    icon: <CheckCircle size={11} className="text-[#10b981]" />,
    className: 'text-[#10b981] bg-[#10b981]/10 border-[#10b981]/25',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-medium border ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function LandingSourcesWindow({ onClose }: LandingSourcesWindowProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('scout_landing_sources_view') as 'grid' | 'list') || 'grid';
  });

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('scout_landing_sources_view', mode);
  };

  const { data: sources, isLoading, isError } = useQuery({
    queryKey: ['sources'],
    queryFn: () => sourcesApi.listSources(),
  });

  const getSourceIcon = (type?: string, url?: string | null) => {
    const lowerUrl = (url || '').toLowerCase();
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
      return <Youtube size={15} className="text-[#ef4444]" />;
    }
    if (lowerUrl.includes('github.com')) {
      return <Github size={15} className="text-[#a855f7]" />;
    }
    switch (type?.toLowerCase()) {
      case 'url':
      case 'website':
      case 'web':
        return <Globe size={15} className="text-[#3b82f6]" />;
      case 'github':
        return <Github size={15} className="text-[#a855f7]" />;
      case 'file':
      case 'pdf':
        return <FileText size={15} className="text-[#f59e0b]" />;
      default:
        return <LinkIcon size={15} className="text-[#3b82f6]" />;
    }
  };

  const filteredSources = (sources || []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const displayTitle = normalizeSourceTitle(s.title, s.canonical_uri).toLowerCase();
    return (
      displayTitle.includes(q) ||
      s.title?.toLowerCase().includes(q) ||
      s.canonical_uri?.toLowerCase().includes(q) ||
      s.source_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 w-full h-full flex flex-col',
        'bg-[#0d0d0f] rounded-none border-none overflow-hidden',
        'transition-all duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[#27272a] bg-[#141416] shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium text-[#a1a1aa] hover:text-[#f4f4f5] bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-[#3f3f46] transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft size={14} className="text-[#3b82f6]" />
            <span className="hidden sm:inline">Explore</span>
          </button>

          <div className="h-4 w-px bg-[#27272a] shrink-0" />

          {/* Title & Count Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[#f4f4f5] tracking-tight truncate">
              Knowledge Sources
            </h2>
            {sources && sources.length > 0 && (
              <span className="px-2 py-0.5 rounded-none text-[11px] font-medium bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
                {sources.length}
              </span>
            )}
          </div>
        </div>

        {/* Search, Toggle & Actions */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-[#71717a] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter sources…"
              className="w-32 sm:w-48 pl-8 pr-7 py-1.5 text-xs rounded-none bg-[#18181b] border border-[#27272a] text-[#f4f4f5] placeholder:text-[#71717a] focus:outline-none focus:border-[#2563eb] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#71717a] hover:text-[#f4f4f5] p-0.5 rounded-none"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Grid / List Switcher */}
          <div className="flex items-center p-0.5 rounded-none bg-[#18181b] border border-[#27272a]">
            <button
              onClick={() => handleViewChange('grid')}
              className={cn(
                'p-1.5 rounded-none transition-colors cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-[#2563eb] text-white'
                  : 'text-[#71717a] hover:text-[#f4f4f5]'
              )}
              title="Grid view"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => handleViewChange('list')}
              className={cn(
                'p-1.5 rounded-none transition-colors cursor-pointer',
                viewMode === 'list'
                  ? 'bg-[#2563eb] text-white'
                  : 'text-[#71717a] hover:text-[#f4f4f5]'
              )}
              title="List view"
            >
              <ListIcon size={13} />
            </button>
          </div>

          {/* Add Source Button */}
          <button
            onClick={() => setAddDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-[#2563eb] text-white hover:bg-[#1d4ed8] text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Source</span>
          </button>
        </div>
      </header>

      {/* ── SOURCES CONTENT AREA ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 sidebar-scroll">
        <div className="max-w-6xl mx-auto w-full">
          {isLoading ? (
            /* Shimmer skeletons */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-none bg-[#141416] border border-[#27272a] p-4 flex flex-col justify-between animate-pulse"
                >
                  <div className="space-y-2">
                    <div className="h-4 bg-[#27272a] rounded-none w-3/4" />
                    <div className="h-3 bg-[#202024] rounded-none w-full" />
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#27272a]">
                    <div className="h-4 bg-[#27272a] rounded-none w-14" />
                    <div className="h-3 bg-[#202024] rounded-none w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-[#ef4444] p-6 rounded-none bg-[#141416] border border-[#ef4444]/30">
              <AlertCircle size={24} className="mb-2" />
              <p className="font-medium">Failed to load knowledge sources</p>
              <p className="text-[#71717a] mt-1">Please refresh or try again.</p>
            </div>
          ) : filteredSources.length === 0 ? (
            /* Empty state */
            <div className="h-72 flex flex-col items-center justify-center text-center p-8">
              <div className="w-12 h-12 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-3">
                <Database size={22} className="text-[#3b82f6]" />
              </div>
              <h3 className="text-sm font-semibold text-[#f4f4f5] mb-1">
                {searchQuery ? 'No matching sources found' : 'No knowledge sources yet'}
              </h3>
              <p className="text-xs text-[#a1a1aa] max-w-sm mb-4 leading-relaxed">
                {searchQuery
                  ? 'Try a different search term or clear the filter.'
                  : 'Index web pages, PDFs, YouTube videos, or GitHub repositories to ground your AI research.'}
              </p>
              <button
                onClick={searchQuery ? () => setSearchQuery('') : () => setAddDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>{searchQuery ? 'Clear filter' : 'Add your first source'}</span>
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* ── GRID VIEW ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="group relative flex flex-col justify-between p-4 rounded-none bg-[#141416] hover:bg-[#18181b] border border-[#27272a] hover:border-[#2563eb] transition-colors"
                >
                  <div>
                    {/* Icon & Delete Action */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="w-8 h-8 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0">
                        {getSourceIcon(source.source_type, source.canonical_uri)}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSourceToDelete(source);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-none text-[#71717a] hover:text-[#ef4444] hover:bg-[#202024] transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
                        title="Delete source"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Title */}
                    <h3
                      className="font-semibold text-sm text-[#f4f4f5] leading-snug line-clamp-2 mb-1"
                      title={source.canonical_uri || source.title || undefined}
                    >
                      {normalizeSourceTitle(source.title, source.canonical_uri)}
                    </h3>

                    {/* Canonical URI */}
                    {source.canonical_uri ? (
                      <a
                        href={source.canonical_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#3b82f6] hover:underline line-clamp-1 mb-3 break-all"
                      >
                        <span className="truncate">{source.canonical_uri}</span>
                        <ExternalLink size={11} className="shrink-0" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#71717a] italic block mb-3">Direct file upload</span>
                    )}
                  </div>

                  {/* Footer Meta */}
                  <div className="pt-3 border-t border-[#27272a] flex items-center justify-between text-[11px] text-[#71717a]">
                    <StatusBadge status={source.status} />
                    <span>{formatRelativeTime(source.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── LIST VIEW ── */
            <div className="rounded-none border border-[#27272a] bg-[#141416] overflow-hidden">
              <div className="divide-y divide-[#27272a]">
                {filteredSources.map((source) => (
                  <div
                    key={source.id}
                    className="group flex items-center justify-between px-4 py-3.5 hover:bg-[#18181b] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <div className="w-8 h-8 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0">
                        {getSourceIcon(source.source_type, source.canonical_uri)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className="text-sm font-medium text-[#f4f4f5] truncate"
                          title={source.canonical_uri || source.title || undefined}
                        >
                          {normalizeSourceTitle(source.title, source.canonical_uri)}
                        </span>
                        {source.canonical_uri ? (
                          <a
                            href={source.canonical_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#3b82f6] hover:underline truncate"
                          >
                            <span className="truncate">{source.canonical_uri}</span>
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-[#71717a]">Direct upload</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={source.status} />
                      <span className="hidden sm:inline text-xs text-[#71717a] w-24 text-right">
                        {formatRelativeTime(source.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSourceToDelete(source);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-none text-[#71717a] hover:text-[#ef4444] hover:bg-[#202024] transition-colors cursor-pointer"
                        title="Delete source"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Source Dialog */}
      <AddSourceDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />

      {/* Delete Source Dialog */}
      <DeleteSourceDialog
        source={sourceToDelete}
        open={Boolean(sourceToDelete)}
        onClose={() => setSourceToDelete(null)}
      />
    </div>
  );
}
