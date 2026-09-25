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
import { formatRelativeTime } from '@/lib/formatters';
import AddSourceDialog from '@/features/sources/AddSourceDialog';
import DeleteSourceDialog from '@/features/sources/DeleteSourceDialog';
import { cn } from '@/lib/utils';

interface LandingSourcesWindowProps {
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  ready:      { label: 'Indexed',    icon: <CheckCircle size={11} className="text-[#10B981]" />, className: 'text-[#10B981] bg-[#10B981]/15 border-[#10B981]/25' },
  processing: { label: 'Indexing',   icon: <Loader2 size={11} className="animate-spin text-[#E4E4E7]" />, className: 'text-[#E4E4E7] bg-[#E4E4E7]/15 border-[#E4E4E7]/25' },
  pending:    { label: 'Queued',     icon: <Clock size={11} />, className: 'text-[#A1A1AA] bg-white/[0.06] border-white/10' },
  failed:     { label: 'Failed',     icon: <AlertCircle size={11} className="text-[#EF4444]" />, className: 'text-[#EF4444] bg-[#EF4444]/15 border-[#EF4444]/25' },
};

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status || 'ready'] ?? {
    label: status || 'Ready',
    icon: <CheckCircle size={11} className="text-[#10B981]" />,
    className: 'text-[#10B981] bg-[#10B981]/15 border-[#10B981]/25',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.className}`}>
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
      return <Youtube size={15} className="text-[#EF4444]" />;
    }
    if (lowerUrl.includes('github.com')) {
      return <Github size={15} className="text-[#A855F7]" />;
    }
    switch (type?.toLowerCase()) {
      case 'url':
      case 'website':
      case 'web':
        return <Globe size={15} className="text-[#E4E4E7]" />;
      case 'github':
        return <Github size={15} className="text-[#A855F7]" />;
      case 'file':
      case 'pdf':
        return <FileText size={15} className="text-[#F59E0B]" />;
      default:
        return <LinkIcon size={15} className="text-[#E4E4E7]" />;
    }
  };

  const filteredSources = (sources || []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.canonical_uri?.toLowerCase().includes(q) ||
      s.source_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 w-full max-w-[980px] h-full max-h-[1000px] my-auto flex flex-col',
        // Liquid glass base
        'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
        'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
        'shadow-[var(--pill-shadow)]',
        'rounded-[34px] overflow-hidden',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'animate-in fade-in zoom-in-95 duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-white/[0.08] shrink-0 backdrop-blur-md select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] border border-transparent hover:border-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Explore</span>
          </button>

          <div className="h-4 w-px bg-white/10 shrink-0" />

          {/* Title & Count Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[#F4F4F5] tracking-tight truncate">
              Knowledge Sources
            </h2>
            {sources && sources.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 border border-white/12 text-[#A1A1AA]">
                {sources.length}
              </span>
            )}
          </div>
        </div>

        {/* Search, Toggle & Actions */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-[#71717A] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter sources…"
              className="w-32 sm:w-44 pl-8 pr-7 py-1 text-xs rounded-full bg-white/[0.05] border border-white/10 text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-white/25 focus:w-48 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#71717A] hover:text-[#F4F4F5] p-0.5 rounded-full"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Grid / List Switcher */}
          <div className="flex items-center p-0.5 rounded-full bg-white/[0.04] border border-white/10">
            <button
              onClick={() => handleViewChange('grid')}
              className={cn(
                'p-1.5 rounded-full transition-all cursor-pointer',
                viewMode === 'grid'
                  ? 'bg-white/15 text-[#F4F4F5] shadow-xs'
                  : 'text-[#71717A] hover:text-[#F4F4F5]'
              )}
              title="Grid view"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => handleViewChange('list')}
              className={cn(
                'p-1.5 rounded-full transition-all cursor-pointer',
                viewMode === 'list'
                  ? 'bg-white/15 text-[#F4F4F5] shadow-xs'
                  : 'text-[#71717A] hover:text-[#F4F4F5]'
              )}
              title="List view"
            >
              <ListIcon size={13} />
            </button>
          </div>

          {/* Add Source Button */}
          <button
            onClick={() => setAddDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black hover:bg-[#F4F4F5] text-xs font-semibold shadow-[0_2px_10px_rgba(255,255,255,0.2)] transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Source</span>
          </button>
        </div>
      </header>

      {/* ── SOURCES CONTENT AREA ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 sidebar-scroll">
        {isLoading ? (
          /* Shimmer skeletons */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-32 rounded-[22px] bg-white/[0.02] border border-white/[0.05] p-4.5 flex flex-col justify-between animate-pulse"
              >
                <div className="space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/4" />
                  <div className="h-3 bg-white/[0.06] rounded w-full" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                  <div className="h-4 bg-white/[0.06] rounded-full w-14" />
                  <div className="h-3 bg-white/[0.04] rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-[#EF4444] p-6 rounded-2xl bg-red-950/10 border border-red-900/20">
            <AlertCircle size={24} className="mb-2" />
            <p className="font-medium">Failed to load knowledge sources</p>
            <p className="text-[#71717A] mt-1">Please refresh or try again.</p>
          </div>
        ) : filteredSources.length === 0 ? (
          /* Empty state */
          <div className="h-72 flex flex-col items-center justify-center text-center p-8">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-3 shadow-sm">
              <Database size={22} className="text-[#E4E4E7]" />
            </div>
            <h3 className="text-sm font-semibold text-[#F4F4F5] mb-1">
              {searchQuery ? 'No matching sources found' : 'No knowledge sources yet'}
            </h3>
            <p className="text-xs text-[#A1A1AA] max-w-sm mb-4 leading-relaxed">
              {searchQuery
                ? 'Try a different search term or clear the filter.'
                : 'Index web pages, PDFs, YouTube videos, or GitHub repositories to ground your AI research.'}
            </p>
            <button
              onClick={searchQuery ? () => setSearchQuery('') : () => setAddDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-[#F4F4F5] transition-all cursor-pointer active:scale-95 shadow-sm"
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
                className="group relative flex flex-col justify-between p-4 rounded-[22px] bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-white/20 transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              >
                <div>
                  {/* Icon & Delete Action */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 shadow-xs">
                      {getSourceIcon(source.source_type, source.canonical_uri)}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSourceToDelete(source);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.08] transition-all cursor-pointer shrink-0 -mr-1 -mt-1 active:scale-95"
                      title="Delete source"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-sm text-[#F4F4F5] leading-snug line-clamp-2 mb-1">
                    {source.title || 'Untitled Source'}
                  </h3>

                  {/* Canonical URI */}
                  {source.canonical_uri ? (
                    <a
                      href={source.canonical_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#E4E4E7] hover:underline line-clamp-1 mb-3 break-all"
                    >
                      <span className="truncate">{source.canonical_uri}</span>
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="text-xs text-[#71717A] italic block mb-3">Direct file upload</span>
                  )}
                </div>

                {/* Footer Meta */}
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#71717A]">
                  <StatusBadge status={source.status} />
                  <span>{formatRelativeTime(source.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── LIST VIEW ── */
          <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] overflow-hidden shadow-sm">
            <div className="divide-y divide-white/[0.06]">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="group flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                      {getSourceIcon(source.source_type, source.canonical_uri)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-[#F4F4F5] truncate">
                        {source.title || 'Untitled Source'}
                      </span>
                      {source.canonical_uri ? (
                        <a
                          href={source.canonical_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#E4E4E7] hover:underline truncate"
                        >
                          <span className="truncate">{source.canonical_uri}</span>
                          <ExternalLink size={10} className="shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-[#71717A]">Direct upload</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={source.status} />
                    <span className="hidden sm:inline text-xs text-[#71717A] w-24 text-right">
                      {formatRelativeTime(source.created_at)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSourceToDelete(source);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.08] transition-all cursor-pointer"
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
