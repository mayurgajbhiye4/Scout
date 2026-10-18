import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Database,
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
  type LucideIcon,
} from 'lucide-react';
import { sourcesApi, Source } from '@/api/sources';
import { formatRelativeTime, normalizeSourceTitle } from '@/lib/formatters';
import AddSourcePopover from '@/features/sources/AddSourcePopover';
import DeleteSourcePopover from '@/features/sources/DeleteSourcePopover';
import { cn } from '@/lib/utils';

interface LandingSourcesWindowProps {
  onClose: () => void;
}

export type SourceCategory = 'all' | 'youtube' | 'docs' | 'pdf' | 'github';

export function getSourceCategory(source: Source): 'youtube' | 'docs' | 'pdf' | 'github' {
  const type = (source.source_type || '').toLowerCase();
  const uri = (source.canonical_uri || '').toLowerCase();
  const title = (source.title || '').toLowerCase();
  const meta = source.metadata || {};
  const mime = ((meta.mime_type as string) || '').toLowerCase();

  // 1. YouTube
  if (
    type === 'youtube' ||
    uri.includes('youtube.com') ||
    uri.includes('youtu.be')
  ) {
    return 'youtube';
  }

  // 2. GitHub
  if (
    type === 'github' ||
    uri.includes('github.com')
  ) {
    return 'github';
  }

  // 3. PDF
  if (
    type === 'pdf' ||
    mime.includes('pdf') ||
    uri.endsWith('.pdf') ||
    uri.includes('.pdf?') ||
    title.endsWith('.pdf')
  ) {
    return 'pdf';
  }

  // 4. Docs (Default for websites, docs, txt, markdown, notion, docx, web_search_result, or any general document)
  return 'docs';
}

interface CategoryConfigItem {
  id: SourceCategory;
  label: string;
  fullName: string;
  icon: LucideIcon;
  activeClass: string;
  activeIconClass: string;
  inactiveIconClass: string;
  activeBadgeClass: string;
}

const CATEGORIES: CategoryConfigItem[] = [
  {
    id: 'all',
    label: 'All',
    fullName: 'All Sources',
    icon: Database,
    activeClass: 'bg-[#2563eb]/20 text-[#60a5fa] border-[#2563eb]/60 shadow-[0_0_12px_rgba(37,99,235,0.15)]',
    activeIconClass: 'text-[#60a5fa]',
    inactiveIconClass: 'text-[#71717a] group-hover:text-[#a1a1aa]',
    activeBadgeClass: 'bg-[#2563eb]/30 text-[#93c5fd] border-[#2563eb]/50',
  },
  {
    id: 'youtube',
    label: 'YT',
    fullName: 'YouTube',
    icon: Youtube,
    activeClass: 'bg-[#ef4444]/15 text-[#fca5a5] border-[#ef4444]/60 shadow-[0_0_12px_rgba(239,68,68,0.15)]',
    activeIconClass: 'text-[#ef4444]',
    inactiveIconClass: 'text-[#ef4444]/70 group-hover:text-[#ef4444]',
    activeBadgeClass: 'bg-[#ef4444]/25 text-[#fca5a5] border-[#ef4444]/50',
  },
  {
    id: 'docs',
    label: 'Docs',
    fullName: 'Documentation & Web',
    icon: Globe,
    activeClass: 'bg-[#3b82f6]/15 text-[#93c5fd] border-[#3b82f6]/60 shadow-[0_0_12px_rgba(59,130,246,0.15)]',
    activeIconClass: 'text-[#3b82f6]',
    inactiveIconClass: 'text-[#3b82f6]/70 group-hover:text-[#3b82f6]',
    activeBadgeClass: 'bg-[#3b82f6]/25 text-[#93c5fd] border-[#3b82f6]/50',
  },
  {
    id: 'pdf',
    label: 'PDF',
    fullName: 'PDF Documents',
    icon: FileText,
    activeClass: 'bg-[#f59e0b]/15 text-[#fcd34d] border-[#f59e0b]/60 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
    activeIconClass: 'text-[#f59e0b]',
    inactiveIconClass: 'text-[#f59e0b]/70 group-hover:text-[#f59e0b]',
    activeBadgeClass: 'bg-[#f59e0b]/25 text-[#fcd34d] border-[#f59e0b]/50',
  },
  {
    id: 'github',
    label: 'GitHub',
    fullName: 'GitHub Repositories',
    icon: Github,
    activeClass: 'bg-[#a855f7]/15 text-[#d8b4fe] border-[#a855f7]/60 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
    activeIconClass: 'text-[#a855f7]',
    inactiveIconClass: 'text-[#a855f7]/70 group-hover:text-[#a855f7]',
    activeBadgeClass: 'bg-[#a855f7]/25 text-[#d8b4fe] border-[#a855f7]/50',
  },
];

const CATEGORY_BADGE_CONFIG: Record<
  'youtube' | 'docs' | 'pdf' | 'github',
  { label: string; icon: React.ReactNode; className: string; activeClassName: string }
> = {
  youtube: {
    label: 'YT',
    icon: <Youtube size={10} className="text-[#ef4444]" />,
    className: 'text-[#f87171] bg-[#ef4444]/10 border-[#ef4444]/25 hover:bg-[#ef4444]/20 hover:border-[#ef4444]/40',
    activeClassName: 'bg-[#ef4444]/25 border-[#ef4444]/50 ring-1 ring-[#ef4444]/50',
  },
  docs: {
    label: 'Docs',
    icon: <Globe size={10} className="text-[#3b82f6]" />,
    className: 'text-[#60a5fa] bg-[#3b82f6]/10 border-[#3b82f6]/25 hover:bg-[#3b82f6]/20 hover:border-[#3b82f6]/40',
    activeClassName: 'bg-[#3b82f6]/25 border-[#3b82f6]/50 ring-1 ring-[#3b82f6]/50',
  },
  pdf: {
    label: 'PDF',
    icon: <FileText size={10} className="text-[#f59e0b]" />,
    className: 'text-[#fbbf24] bg-[#f59e0b]/10 border-[#f59e0b]/25 hover:bg-[#f59e0b]/20 hover:border-[#f59e0b]/40',
    activeClassName: 'bg-[#f59e0b]/25 border-[#f59e0b]/50 ring-1 ring-[#f59e0b]/50',
  },
  github: {
    label: 'GitHub',
    icon: <Github size={10} className="text-[#a855f7]" />,
    className: 'text-[#c084fc] bg-[#a855f7]/10 border-[#a855f7]/25 hover:bg-[#a855f7]/20 hover:border-[#a855f7]/40',
    activeClassName: 'bg-[#a855f7]/25 border-[#a855f7]/50 ring-1 ring-[#a855f7]/50',
  },
};

const CATEGORY_URL_COLORS: Record<'youtube' | 'docs' | 'pdf' | 'github', string> = {
  docs: 'text-[#2dd4bf] hover:text-[#5eead4]',
  github: 'text-[#c084fc] hover:text-[#d8b4fe]',
  youtube: 'text-[#f87171] hover:text-[#fca5a5]',
  pdf: 'text-[#fbbf24] hover:text-[#fde68a]',
};

function getCategoryUrlClass(category: 'youtube' | 'docs' | 'pdf' | 'github'): string {
  return CATEGORY_URL_COLORS[category] || 'text-[#2dd4bf] hover:text-[#5eead4]';
}

function CategoryBadge({
  category,
  active = false,
  onClick,
}: {
  category: 'youtube' | 'docs' | 'pdf' | 'github';
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const cfg = CATEGORY_BADGE_CONFIG[category];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Filter by ${cfg.label}`}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[10px] font-medium border transition-colors cursor-pointer select-none',
        cfg.className,
        active && cfg.activeClassName
      )}
    >
      {cfg.icon}
      <span>{cfg.label}</span>
    </button>
  );
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  ready:      { label: 'Indexed',    icon: <CheckCircle size={11} className="text-[#71717a]" />, className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]' },
  indexed:    { label: 'Indexed',    icon: <CheckCircle size={11} className="text-[#71717a]" />, className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]' },
  processing: { label: 'Indexing',   icon: <Loader2 size={11} className="animate-spin text-[#3b82f6]" />, className: 'text-[#3b82f6] bg-[#2563eb]/10 border-[#2563eb]/25' },
  pending:    { label: 'Queued',     icon: <Clock size={11} className="text-[#71717a]" />, className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]' },
  failed:     { label: 'Failed',     icon: <AlertCircle size={11} className="text-[#ef4444]" />, className: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/25' },
};

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status || 'ready'] ?? {
    label: status || 'Indexed',
    icon: <CheckCircle size={11} className="text-[#71717a]" />,
    className: 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-medium border ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function LandingSourcesWindow({ onClose }: LandingSourcesWindowProps) {
  const [selectedCategory, setSelectedCategory] = useState<SourceCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('scout_landing_sources_view') as 'grid' | 'list') || 'grid';
  });

  const handleViewChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('scout_landing_sources_view', mode);
  };

  const handleCategorySelect = (categoryId: SourceCategory) => {
    if (selectedCategory === categoryId && categoryId !== 'all') {
      setSelectedCategory('all');
    } else {
      setSelectedCategory(categoryId);
    }
  };

  const handleClearFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
  };

  const { data: sources, isLoading, isError } = useQuery({
    queryKey: ['sources'],
    queryFn: () => sourcesApi.listSources(),
  });

  const getSourceIcon = (source: Source) => {
    const category = getSourceCategory(source);
    switch (category) {
      case 'youtube':
        return <Youtube size={15} className="text-[#ef4444]" />;
      case 'github':
        return <Github size={15} className="text-[#a855f7]" />;
      case 'pdf':
        return <FileText size={15} className="text-[#f59e0b]" />;
      case 'docs':
      default: {
        const type = (source.source_type || '').toLowerCase();
        if (type === 'txt' || type === 'markdown' || type === 'docx') {
          return <FileText size={15} className="text-[#3b82f6]" />;
        }
        return <Globe size={15} className="text-[#3b82f6]" />;
      }
    }
  };

  const getSourceTimestamp = (s: Source): number => {
    const dateStr = s.last_indexed_at || s.created_at;
    if (!dateStr) return 0;
    const time = new Date(dateStr).getTime();
    return isNaN(time) ? 0 : time;
  };

  const categoryCounts = React.useMemo(() => {
    const counts: Record<SourceCategory, number> = {
      all: sources?.length || 0,
      youtube: 0,
      docs: 0,
      pdf: 0,
      github: 0,
    };
    (sources || []).forEach((s) => {
      const cat = getSourceCategory(s);
      if (cat in counts) {
        counts[cat]++;
      }
    });
    return counts;
  }, [sources]);

  const filteredSources = React.useMemo(() => {
    return (sources || [])
      .filter((s) => {
        // Category filter
        if (selectedCategory !== 'all') {
          const cat = getSourceCategory(s);
          if (cat !== selectedCategory) return false;
        }

        // Search query filter
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const displayTitle = normalizeSourceTitle(s.title, s.canonical_uri).toLowerCase();
        const category = getSourceCategory(s);
        return (
          displayTitle.includes(q) ||
          s.title?.toLowerCase().includes(q) ||
          s.canonical_uri?.toLowerCase().includes(q) ||
          s.source_type?.toLowerCase().includes(q) ||
          category.includes(q)
        );
      })
      .sort((a, b) => getSourceTimestamp(b) - getSourceTimestamp(a));
  }, [sources, selectedCategory, searchQuery]);

  const selectedCategoryConfig: CategoryConfigItem =
    CATEGORIES.find((c) => c.id === selectedCategory) ?? CATEGORIES[0]!;

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
              <span className="px-2 py-0.5 rounded-none text-[11px] font-mono bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
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
                title="Clear search text"
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
          <AddSourcePopover side="bottom" align="end" sideOffset={6}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-[#2563eb] text-white hover:bg-[#1d4ed8] text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <Plus size={13} />
              <span>Add Source</span>
            </button>
          </AddSourcePopover>
        </div>
      </header>

      {/* ── CATEGORY FILTER BAR ── */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2 border-b border-[#27272a] bg-[#111113] shrink-0 select-none overflow-x-auto no-scrollbar">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 min-w-0">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] ?? 0;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={cn(
                  'group flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-none border transition-all cursor-pointer whitespace-nowrap',
                  isSelected
                    ? cat.activeClass
                    : 'bg-[#141416] hover:bg-[#18181b] text-[#a1a1aa] hover:text-[#f4f4f5] border-[#27272a] hover:border-[#3f3f46]'
                )}
                title={`Filter by ${cat.fullName}`}
              >
                <Icon size={13} className={isSelected ? cat.activeIconClass : cat.inactiveIconClass} />
                <span>{cat.label}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 text-[10px] font-mono rounded-none border transition-colors',
                    isSelected
                      ? cat.activeBadgeClass
                      : 'bg-[#18181b] text-[#71717a] border-[#27272a] group-hover:text-[#a1a1aa]'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter Stats & Reset */}
        <div className="hidden sm:flex items-center gap-2.5 text-xs text-[#71717a] shrink-0">
          {(selectedCategory !== 'all' || searchQuery) && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-[11px] text-[#3b82f6] hover:text-[#60a5fa] hover:underline cursor-pointer"
            >
              <X size={11} />
              <span>Reset filter</span>
            </button>
          )}
          <span className="font-mono text-[11px]">
            {filteredSources.length} of {sources?.length || 0}
          </span>
        </div>
      </div>

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
                {selectedCategory === 'all' && !searchQuery ? (
                  <Database size={22} className="text-[#3b82f6]" />
                ) : searchQuery ? (
                  <Search size={22} className="text-[#71717a]" />
                ) : (
                  (() => {
                    const CatIcon = selectedCategoryConfig.icon;
                    return <CatIcon size={22} className={selectedCategoryConfig.activeIconClass} />;
                  })()
                )}
              </div>
              <h3 className="text-sm font-semibold text-[#f4f4f5] mb-1">
                {!sources || sources.length === 0
                  ? 'No knowledge sources yet'
                  : searchQuery
                  ? 'No matching sources found'
                  : `No ${selectedCategoryConfig.fullName} found`}
              </h3>
              <p className="text-xs text-[#a1a1aa] max-w-sm mb-4 leading-relaxed">
                {!sources || sources.length === 0
                  ? 'Index web pages, PDFs, YouTube videos, or GitHub repositories to ground your AI research.'
                  : searchQuery
                  ? selectedCategory !== 'all'
                    ? `No ${selectedCategoryConfig.fullName} sources matched "${searchQuery}".`
                    : `No sources matched "${searchQuery}". Try a different search term.`
                  : selectedCategory === 'youtube'
                  ? 'No YouTube videos or playlists have been indexed yet.'
                  : selectedCategory === 'github'
                  ? 'No GitHub repositories have been indexed yet.'
                  : selectedCategory === 'pdf'
                  ? 'No PDF documents or research papers have been uploaded yet.'
                  : selectedCategory === 'docs'
                  ? 'No documentation sites, web articles, or text documents have been indexed yet.'
                  : 'Try selecting a different category or clearing filters.'}
              </p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {searchQuery || selectedCategory !== 'all' ? (
                  <>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold bg-[#18181b] border border-[#27272a] text-[#f4f4f5] hover:bg-[#202024] transition-colors cursor-pointer"
                      >
                        <X size={12} />
                        <span>Clear search</span>
                      </button>
                    )}
                    {selectedCategory !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('all')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold bg-[#18181b] border border-[#27272a] text-[#f4f4f5] hover:bg-[#202024] transition-colors cursor-pointer"
                      >
                        <span>Show all sources</span>
                      </button>
                    )}
                    <AddSourcePopover side="top" align="center" sideOffset={6}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer"
                      >
                        <Plus size={12} />
                        <span>Add Source</span>
                      </button>
                    </AddSourcePopover>
                  </>
                ) : (
                  <AddSourcePopover side="top" align="center" sideOffset={6}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add your first source</span>
                    </button>
                  </AddSourcePopover>
                )}
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* ── GRID VIEW ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSources.map((source) => {
                const category = getSourceCategory(source);
                return (
                  <div
                    key={source.id}
                    className="group relative flex flex-col justify-between p-4 rounded-none bg-[#141416] hover:bg-[#18181b] border border-[#27272a] hover:border-[#2563eb] transition-colors min-w-0 overflow-hidden"
                  >
                    <div className="min-w-0">
                      {/* Icon & Delete Action */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="w-8 h-8 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0">
                          {getSourceIcon(source)}
                        </div>
                        <DeleteSourcePopover
                          source={source}
                          side="bottom"
                          align="end"
                          sideOffset={6}
                        >
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-none text-[#71717a] hover:text-[#ef4444] hover:bg-[#202024] transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
                            title="Delete source"
                          >
                            <Trash2 size={13} />
                          </button>
                        </DeleteSourcePopover>
                      </div>

                      {/* Title */}
                      <h3
                        className="font-semibold text-sm text-[#f4f4f5] leading-snug line-clamp-2 mb-1 break-words"
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
                          className={cn(
                            'flex items-center gap-1 text-xs hover:underline mb-3 max-w-full min-w-0 transition-colors',
                            getCategoryUrlClass(category)
                          )}
                        >
                          <span className="truncate flex-1 min-w-0">{source.canonical_uri}</span>
                          <ExternalLink size={11} className="shrink-0 opacity-80" />
                        </a>
                      ) : (
                        <span className="text-xs text-[#71717a] italic block mb-3">Direct file upload</span>
                      )}
                    </div>

                    {/* Footer Meta */}
                    <div className="pt-3 border-t border-[#27272a] flex items-center justify-between text-[11px] text-[#71717a]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <StatusBadge status={source.status} />
                        <CategoryBadge
                          category={category}
                          active={selectedCategory === category}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategorySelect(category);
                          }}
                        />
                      </div>
                      <span
                        className="shrink-0"
                        title={
                          source.last_indexed_at
                            ? `Ingested: ${new Date(source.last_indexed_at).toLocaleString()}`
                            : source.created_at
                            ? `Added: ${new Date(source.created_at).toLocaleString()}`
                            : undefined
                        }
                      >
                        {formatRelativeTime(source.last_indexed_at || source.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── LIST VIEW ── */
            <div className="rounded-none border border-[#27272a] bg-[#141416] overflow-hidden">
              <div className="divide-y divide-[#27272a]">
                {filteredSources.map((source) => {
                  const category = getSourceCategory(source);
                  return (
                    <div
                      key={source.id}
                      className="group flex items-center justify-between px-4 py-3.5 hover:bg-[#18181b] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="w-8 h-8 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0">
                          {getSourceIcon(source)}
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
                              className={cn(
                                'flex items-center gap-1 text-xs hover:underline max-w-full min-w-0 transition-colors',
                                getCategoryUrlClass(category)
                              )}
                            >
                              <span className="truncate flex-1 min-w-0">{source.canonical_uri}</span>
                              <ExternalLink size={10} className="shrink-0 opacity-80" />
                            </a>
                          ) : (
                            <span className="text-xs text-[#71717a]">Direct upload</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <CategoryBadge
                          category={category}
                          active={selectedCategory === category}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategorySelect(category);
                          }}
                        />
                        <StatusBadge status={source.status} />
                        <span
                          className="hidden sm:inline text-xs text-[#71717a] w-24 text-right"
                          title={
                            source.last_indexed_at
                              ? `Ingested: ${new Date(source.last_indexed_at).toLocaleString()}`
                              : source.created_at
                              ? `Added: ${new Date(source.created_at).toLocaleString()}`
                              : undefined
                          }
                        >
                          {formatRelativeTime(source.last_indexed_at || source.created_at)}
                        </span>
                        <DeleteSourcePopover
                          source={source}
                          side="left"
                          align="center"
                          sideOffset={6}
                        >
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-none text-[#71717a] hover:text-[#ef4444] hover:bg-[#202024] transition-colors cursor-pointer"
                            title="Delete source"
                          >
                            <Trash2 size={13} />
                          </button>
                        </DeleteSourcePopover>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
