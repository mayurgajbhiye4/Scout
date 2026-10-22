import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Network,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  AlertCircle,
  Search,
  FileText,
  BrainCircuit,
  ArrowRight,
  X,
  Youtube,
  Globe,
  Loader2,
} from '@/components/icons';
import { knowledgeApi, GraphSummary } from '@/api/knowledge';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';

interface CuriosityMapProps {
  fullscreen?: boolean;
  onClose?: () => void;
  initialGraphId?: string;
}

const TYPE_CONFIG = [
  { type: 'User', color: '#38BDF8', label: 'You' },
  { type: 'Document', color: '#60A5FA', label: 'Document' },
  { type: 'Person', color: '#34D399', label: 'Person' },
  { type: 'Technology', color: '#F43F5E', label: 'Technology' },
  { type: 'Architecture', color: '#A855F7', label: 'Architecture' },
  { type: 'Concept', color: '#FBBF24', label: 'Concept' },
];

function getNodeColor(type: string, isLight = false): string {
  switch (type?.toLowerCase()) {
    case 'user':
      return isLight ? '#0284c7' : '#38BDF8';
    case 'document':
    case 'source':
      return isLight ? '#0f766e' : '#14b8a6';
    case 'person':
      return isLight ? '#0d9488' : '#2dd4bf';
    case 'technology':
    case 'aisystem':
      return isLight ? '#e11d48' : '#F43F5E';
    case 'architecture':
    case 'researchpaper':
    case 'publication':
      return isLight ? '#9333ea' : '#A855F7';
    case 'platform':
    case 'organization':
      return isLight ? '#0284c7' : '#38BDF8';
    default:
      return isLight ? '#d97706' : '#FBBF24';
  }
}

export default function CuriosityMap({ fullscreen = false, onClose, initialGraphId }: CuriosityMapProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  // Graph Browser navigation state: null = browsing list, string = viewing that specific graph
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(initialGraphId || null);
  const [selectedGraphMeta, setSelectedGraphMeta] = useState<GraphSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'universal' | 'document' | 'memory'>('all');
  const [inspectedNode, setInspectedNode] = useState<any | null>(null);

  // Canvas refs and sizing
  const containerRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Callback ref: Guaranteed to execute as soon as container mounts into DOM regardless of async data loading
  const containerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    containerRef.current = el;

    if (!el) return;

    const measure = () => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = Math.floor(el.clientWidth || rect.width || (fullscreen ? window.innerWidth - 280 : 800));
      const h = Math.floor(el.clientHeight || rect.height || (fullscreen ? window.innerHeight - 60 : 650));
      if (w > 0 && h > 0) {
        setDimensions((prev) => {
          if (prev.width === w && prev.height === h) return prev;
          return { width: w, height: h };
        });
      }
    };

    measure();
    requestAnimationFrame(measure);
    const timer = setTimeout(measure, 60);

    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);
    roRef.current = ro;

    return () => clearTimeout(timer);
  }, [fullscreen]);

  const GRAPHS_PAGE_SIZE = 20;

  const browserScrollRef = useRef<HTMLDivElement>(null);
  const browserSentinelRef = useRef<HTMLDivElement>(null);

  // 1. Fetch available graphs list with infinite scroll
  const {
    data: graphsData,
    isLoading: isLoadingList,
    isError: isErrorList,
    error: errorList,
    refetch: refetchList,
    isFetching: isFetchingList,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['knowledge-graphs-list'],
    queryFn: ({ pageParam = 0 }) =>
      knowledgeApi.listGraphs({ skip: pageParam, limit: GRAPHS_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < GRAPHS_PAGE_SIZE) {
        return undefined;
      }
      return allPages.length * GRAPHS_PAGE_SIZE;
    },
  });

  const graphsList = useMemo(
    () => graphsData?.pages.flatMap((page) => page) ?? [],
    [graphsData]
  );

  const handleBrowserScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 100 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  useEffect(() => {
    const sentinel = browserSentinelRef.current;
    const container = browserScrollRef.current;
    if (!sentinel || !container || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: container, rootMargin: '60px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Sync metadata when initialGraphId is passed
  useEffect(() => {
    if (selectedGraphId && !selectedGraphMeta && graphsList) {
      const found = graphsList.find((g) => g.id === selectedGraphId);
      if (found) setSelectedGraphMeta(found);
    }
  }, [selectedGraphId, selectedGraphMeta, graphsList]);

  // 2. Fetch specific graph data when one is selected
  const {
    data: activeGraphData,
    isLoading: isLoadingGraph,
    isError: isErrorGraph,
    error: errorGraph,
    refetch: refetchGraph,
    isFetching: isFetchingGraph,
  } = useQuery({
    queryKey: ['knowledge-graph', selectedGraphId],
    queryFn: () => knowledgeApi.getKnowledgeGraph(selectedGraphId || 'universal'),
    enabled: Boolean(selectedGraphId),
  });

  // Reset inspected node when switching graphs
  useEffect(() => {
    setInspectedNode(null);
  }, [selectedGraphId]);

  // Format data for ForceGraph2D
  const graphData = useMemo(() => {
    if (!activeGraphData) return { nodes: [], links: [] };

    return {
      nodes: (activeGraphData.nodes || []).map((n) => ({
        ...n,
        val: n.type === 'User' ? 30 : n.type === 'Document' ? 22 : 14,
      })),
      links: (activeGraphData.edges || []).map((e) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      })),
    };
  }, [activeGraphData]);

  // Auto-center and fit graph camera immediately when nodes and canvas dimensions become available
  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0 && dimensions.width > 0) {
      const t1 = setTimeout(() => {
        fgRef.current?.zoomToFit(400, fullscreen ? 50 : 20);
      }, 200);
      const t2 = setTimeout(() => {
        fgRef.current?.zoomToFit(400, fullscreen ? 50 : 20);
      }, 600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [selectedGraphId, graphData.nodes.length, dimensions.width, dimensions.height, fullscreen]);

  // Custom Canvas Node Rendering
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (node.x === undefined || node.y === undefined) return;
      const label = node.label || node.id || '';
      const fontSize = Math.max(10 / globalScale, 12 / globalScale);
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const bckgWidth = textWidth + fontSize * 1.2;
      const bckgHeight = fontSize * 1.8;
      const pillRadius = bckgHeight / 2;

      const isInspected = inspectedNode?.id === node.id;

      // Node pill background
      ctx.fillStyle = isLight
        ? (isInspected ? 'rgba(238, 242, 255, 0.98)' : 'rgba(255, 255, 255, 0.96)')
        : (isInspected ? 'rgba(30, 41, 59, 0.98)' : 'rgba(15, 15, 20, 0.92)');
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(
          node.x - bckgWidth / 2,
          node.y - bckgHeight / 2,
          bckgWidth,
          bckgHeight,
          pillRadius
        );
      } else {
        const x = node.x - bckgWidth / 2;
        const y = node.y - bckgHeight / 2;
        const r = pillRadius;
        ctx.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
        ctx.arc(x + bckgWidth - r, y + r, r, (3 * Math.PI) / 2, Math.PI / 2);
        ctx.closePath();
      }
      ctx.fill();

      // Border matching node entity type
      ctx.lineWidth = (isInspected ? 2.5 : 1.5) / globalScale;
      ctx.strokeStyle = isInspected
        ? (isLight ? '#0f766e' : '#2dd4bf')
        : getNodeColor(node.type, isLight);
      ctx.stroke();

      // Text label
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isLight
        ? (isInspected ? '#115e59' : '#0f172a')
        : (isInspected ? '#FFFFFF' : '#F4F4F5');
      ctx.fillText(label, node.x, node.y);

      node.__bckgDimensions = [bckgWidth, bckgHeight];
    },
    [inspectedNode, isLight]
  );

  const handleZoomIn = () => {
    if (fgRef.current) {
      const currentZoom = fgRef.current.zoom();
      fgRef.current.zoom(currentZoom * 1.3, 300);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      const currentZoom = fgRef.current.zoom();
      fgRef.current.zoom(currentZoom / 1.3, 300);
    }
  };

  const handleFit = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, fullscreen ? 50 : 20);
    }
  };

  const handleSelectGraph = (graph: GraphSummary) => {
    setSelectedGraphId(graph.id);
    setSelectedGraphMeta(graph);
  };

  const handleBackToBrowser = () => {
    setSelectedGraphId(null);
    setSelectedGraphMeta(null);
    setInspectedNode(null);
  };

  // Filter graphs by search and type
  const filteredGraphs = useMemo(() => {
    if (!graphsList) return [];
    return graphsList.filter((g) => {
      const matchesType =
        activeFilter === 'all' ? true : g.type === activeFilter;

      if (!matchesType) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = g.title.toLowerCase().includes(q);
      const matchDesc = (g.description || '').toLowerCase().includes(q);
      const matchEntities = (g.top_entities || []).some((e) => e.toLowerCase().includes(q));

      return matchTitle || matchDesc || matchEntities;
    });
  }, [graphsList, searchQuery, activeFilter]);

  // Aggregate stats across all graphs
  const stats = useMemo(() => {
    const list = graphsList || [];
    const docGraphs = list.filter((g) => g.type === 'document');
    const totalEntities = list.reduce((acc, g) => acc + (g.node_count || 0), 0);
    return {
      totalGraphs: list.length,
      docGraphsCount: docGraphs.length,
      totalEntities,
    };
  }, [graphsList]);

  // Connected neighbors for the inspected node
  const inspectedNodeNeighbors = useMemo(() => {
    if (!inspectedNode || !graphData) return [];
    const nodeId = inspectedNode.id;
    const neighborMap = new Map<string, { label: string; type: string; rel: string }>();

    graphData.links.forEach((l: any) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;

      if (sId === nodeId && tId !== nodeId) {
        const targetNode = graphData.nodes.find((n: any) => n.id === tId);
        if (targetNode) {
          neighborMap.set(tId, {
            label: targetNode.label || targetNode.id,
            type: targetNode.type || 'Concept',
            rel: l.relationship || 'RELATES_TO',
          });
        }
      } else if (tId === nodeId && sId !== nodeId) {
        const sourceNode = graphData.nodes.find((n: any) => n.id === sId);
        if (sourceNode) {
          neighborMap.set(sId, {
            label: sourceNode.label || sourceNode.id,
            type: sourceNode.type || 'Concept',
            rel: l.relationship || 'RELATES_TO',
          });
        }
      }
    });

    return Array.from(neighborMap.values());
  }, [inspectedNode, graphData]);

  // Helper icon for graph type
  const getGraphIcon = (type: string, title: string) => {
    const lower = title.toLowerCase();
    if (type === 'universal') {
      return <Network size={16} className="text-sky-400" />;
    }
    if (type === 'memory') {
      return <BrainCircuit size={16} className="text-amber-400" />;
    }
    if (lower.includes('youtube') || lower.includes('video')) {
      return <Youtube size={16} className="text-rose-400" />;
    }
    if (lower.includes('http') || lower.includes('.com') || lower.includes('web')) {
      return <Globe size={16} className="text-teal-500 dark:text-teal-400" />;
    }
    return <FileText size={16} className="text-teal-600 dark:text-teal-400" />;
  };

  // Compact embedded mode (if mounted without fullscreen)
  if (!fullscreen) {
    return (
      <div className="w-full bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] rounded-2xl sm:rounded-3xl overflow-hidden relative group h-[250px] shadow-sm">
        <div className="absolute top-3 left-4 z-10 flex items-center justify-between right-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <h3 className="text-xs font-semibold text-slate-900 dark:text-[#f4f4f5] tracking-wide bg-slate-100 dark:bg-[#18181b] px-3 py-1 rounded-full border border-slate-200 dark:border-[#27272a]">
              Neural Knowledge Graphs
            </h3>
          </div>
          <span className="text-[11px] text-slate-600 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#18181b] px-3 py-1 rounded-full border border-slate-200 dark:border-[#27272a]">
            {stats.totalGraphs} graphs available
          </span>
        </div>
        <div ref={containerCallbackRef} className="w-full h-full cursor-grab active:cursor-grabbing">
          {dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              backgroundColor={isLight ? '#f8fafc' : '#141416'}
              nodeLabel="label"
              nodeRelSize={6}
              linkColor={() => (isLight ? 'rgba(148, 163, 184, 0.5)' : 'rgba(82, 82, 91, 0.4)')}
              linkWidth={1.5}
              nodeCanvasObject={paintNode}
            />
          )}
        </div>
      </div>
    );
  }

  // Full-screen window mode
  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 w-full h-full flex flex-col',
        'bg-[var(--bg)] border-none overflow-hidden',
        'transition-all duration-200'
      )}
    >
      {/* ── HEADER NAVIGATION BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-[#27272a] bg-white/95 dark:bg-[#141416]/95 backdrop-blur-md shrink-0 select-none z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          {selectedGraphId ? (
            <button
              type="button"
              onClick={handleBackToBrowser}
              title="Back to all graphs"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-800 dark:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] hover:border-slate-300 dark:hover:border-[#3f3f46] transition-colors cursor-pointer shrink-0 active:scale-95"
            >
              <ArrowLeft size={14} className="text-primary" />
              <span>All Graphs</span>
            </button>
          ) : onClose ? (
            <button
              type="button"
              onClick={onClose}
              title="Back to explore"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] hover:border-slate-300 dark:hover:border-[#3f3f46] transition-colors cursor-pointer shrink-0 active:scale-95"
            >
              <ArrowLeft size={14} className="text-primary" />
              <span className="hidden sm:inline">Explore</span>
            </button>
          ) : null}

          {(selectedGraphId || onClose) && <div className="h-4 w-px bg-slate-200 dark:bg-[#27272a] shrink-0" />}

          {/* Title & Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <Network size={16} className="text-primary shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-[#f4f4f5] tracking-tight truncate max-w-[280px] sm:max-w-[420px]">
              {selectedGraphMeta ? selectedGraphMeta.title : 'Knowledge Graph Browser'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-[#a1a1aa] shrink-0">
              {selectedGraphId
                ? `${graphData.nodes.length} nodes · ${graphData.links.length} edges`
                : `${filteredGraphs.length} graphs`}
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {selectedGraphId ? (
            /* Viewer controls */
            <>
              {/* Entity Type Legend Chips */}
              <div className="hidden xl:flex items-center gap-2.5 px-3.5 py-1 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
                {TYPE_CONFIG.map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-[#a1a1aa]">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>{label}</span>
                  </span>
                ))}
              </div>

              {/* Fit button */}
              <button
                type="button"
                onClick={handleFit}
                title="Fit to Screen"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] rounded-full transition-colors cursor-pointer shrink-0 active:scale-95"
              >
                <Maximize2 size={13} className="text-primary" />
                <span className="hidden sm:inline">Fit</span>
              </button>

              {/* Zoom buttons */}
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In"
                className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] rounded-full transition-colors cursor-pointer shrink-0 active:scale-95"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out"
                className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] rounded-full transition-colors cursor-pointer shrink-0 active:scale-95"
              >
                <ZoomOut size={13} />
              </button>

              {/* Refresh single graph button */}
              <button
                type="button"
                onClick={() => refetchGraph()}
                title="Refresh Graph"
                className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] rounded-full transition-colors cursor-pointer shrink-0 active:scale-95"
              >
                <RotateCw size={13} className={cn(isFetchingGraph && 'animate-spin text-primary')} />
              </button>
            </>
          ) : (
            /* Browser list controls */
            <>
              {/* Refresh list button */}
              <button
                type="button"
                onClick={() => refetchList()}
                title="Refresh Graphs List"
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] rounded-full transition-colors cursor-pointer shrink-0 active:scale-95"
              >
                <RotateCw size={12} className={cn(isFetchingList && 'animate-spin text-primary')} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── ARCADE RATE LIMIT WARNING BANNER ── */}
      <ArcadeRateLimitBanner className="border-b border-slate-200 dark:border-[#27272a]" />

      {/* ── MODE 1: GRAPH BROWSER / GALLERY (BROWSE ALL GRAPHS) ── */}
      {!selectedGraphId ? (
        <div
          ref={browserScrollRef}
          onScroll={handleBrowserScroll}
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 sidebar-scroll"
        >
          <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
            {/* ── SEARCH & FILTER CONTROLS ── */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              {/* Search Input */}
              <div className="relative flex-1 max-w-md">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#71717a] pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search graphs by title, source, or concept..."
                  className="w-full pl-9 pr-8 py-2 rounded-full text-xs bg-slate-50 dark:bg-[#18181b] text-slate-900 dark:text-[#f4f4f5] placeholder:text-slate-400 dark:placeholder:text-[#71717a] border border-slate-200 dark:border-[#27272a] focus:border-primary outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#71717a] hover:text-slate-700 dark:hover:text-[#f4f4f5] p-1 rounded-full cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] self-start sm:self-auto overflow-x-auto max-w-full">
                {[
                  { id: 'all', label: 'All Graphs' },
                  { id: 'document', label: 'Sources' },
                  { id: 'memory', label: 'Mindmap' },
                  { id: 'universal', label: 'Universal' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id as any)}
                    className={cn(
                      'px-3.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap active:scale-95',
                      activeFilter === tab.id
                        ? 'bg-primary text-white font-semibold shadow-sm'
                        : 'text-slate-500 dark:text-[#71717a] hover:text-slate-900 dark:hover:text-[#f4f4f5]'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── BROWSER CONTENT STATE ── */}
            {isLoadingList ? (
              /* Skeleton Loading Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="p-5 sm:p-6 rounded-[32px] sm:rounded-[36px] bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] animate-pulse space-y-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-[#27272a]" />
                      <div className="h-4 bg-slate-200 dark:bg-[#27272a] rounded-full w-20" />
                    </div>
                    <div className="h-4 bg-slate-200 dark:bg-[#27272a] rounded-full w-4/5" />
                    <div className="h-3 bg-slate-100 dark:bg-[#202024] rounded-full w-full" />
                    <div className="flex gap-1.5 pt-1">
                      <div className="h-5 bg-slate-100 dark:bg-[#202024] rounded-full w-16" />
                      <div className="h-5 bg-slate-100 dark:bg-[#202024] rounded-full w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isErrorList ? (
              /* Error State */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle size={32} className="text-red-500 dark:text-[#ef4444] mb-2" />
                <p className="text-sm font-medium text-slate-900 dark:text-[#f4f4f5]">Failed to load knowledge graphs</p>
                <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1 mb-4">
                  {(errorList as any)?.message || 'Check your database connection'}
                </p>
                <button
                  type="button"
                  onClick={() => refetchList()}
                  className="px-4 py-1.5 rounded-full text-xs bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-800 dark:text-[#f4f4f5] border border-slate-200 dark:border-[#27272a] transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : filteredGraphs.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] flex items-center justify-center mb-3 text-slate-500 dark:text-[#a1a1aa]">
                  <Network size={26} className="text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f4f4f5] mb-1">
                  {searchQuery ? 'No matching graphs found' : 'No knowledge graphs yet'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#a1a1aa] max-w-sm mb-4 leading-relaxed">
                  {searchQuery
                    ? `No graphs match "${searchQuery}". Try searching for another concept or clear the search.`
                    : 'Ingest research sources (PDFs, YouTube videos, web links) to automatically generate neural knowledge graphs.'}
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-800 dark:text-[#f4f4f5] border border-slate-200 dark:border-[#27272a] transition-colors cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              /* ── GRAPHS GRID ── */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredGraphs.map((graph) => {
                  const isUniversal = graph.type === 'universal';
                  const isMemory = graph.type === 'memory';

                  return (
                    <div
                      key={graph.id}
                      onClick={() => handleSelectGraph(graph)}
                      className={cn(
                        'group relative flex flex-col justify-between p-5 sm:p-6 rounded-[32px] sm:rounded-[36px] transition-all cursor-pointer select-none',
                        'border border-slate-200/90 dark:border-[#27272a] bg-white dark:bg-[#141416] hover:bg-slate-50 dark:hover:bg-[#18181b] hover:border-primary/50 dark:hover:border-primary/50 shadow-sm hover:shadow-md active:scale-[0.99]'
                      )}
                    >
                      <div>
                        {/* Top Row: Icon Badge & Node Stats */}
                        <div className="flex items-center justify-between gap-2.5 mb-3.5">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-full border border-slate-200 dark:border-[#27272a] bg-slate-100 dark:bg-[#18181b] flex items-center justify-center shrink-0 group-hover:border-primary/40 group-hover:bg-primary/10 transition-colors'
                            )}
                          >
                            {getGraphIcon(graph.type, graph.title)}
                          </div>

                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-medium bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-[#a1a1aa]">
                            <span>{graph.node_count} nodes</span>
                            <span className="opacity-40">·</span>
                            <span>{graph.edge_count} edges</span>
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f4f4f5] group-hover:text-primary dark:group-hover:text-white transition-colors line-clamp-2 leading-snug mb-1.5">
                          {graph.title}
                        </h3>

                        {/* Description */}
                        {graph.description && (
                          <p className="text-xs text-slate-600 dark:text-[#71717a] line-clamp-2 leading-relaxed mb-3">
                            {graph.description}
                          </p>
                        )}

                        {/* Top Entities Tags */}
                        {graph.top_entities && graph.top_entities.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {graph.top_entities.slice(0, 4).map((ent, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-[#18181b] text-slate-700 dark:text-[#a1a1aa] border border-slate-200 dark:border-[#27272a] group-hover:border-slate-300 dark:group-hover:border-[#3f3f46] transition-colors max-w-[150px] truncate"
                                title={ent}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                <span className="truncate">{ent}</span>
                              </span>
                            ))}
                            {graph.top_entities.length > 4 && (
                              <span className="px-2.5 py-1 rounded-full text-[9px] font-mono text-slate-500 dark:text-[#71717a] bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
                                +{graph.top_entities.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer Action */}
                      <div className="pt-3 border-t border-slate-200 dark:border-[#27272a] flex items-center justify-between text-xs text-slate-500 dark:text-[#a1a1aa] group-hover:text-slate-900 dark:group-hover:text-[#f4f4f5] transition-colors">
                        <span className="text-[10px] capitalize font-mono px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a]">
                          {isUniversal ? 'Universal Brain' : isMemory ? 'Neural Mindmap' : 'Document Subgraph'}
                        </span>
                        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-primary bg-primary/10 group-hover:bg-primary/20 border border-primary/30 group-hover:border-primary/50 transition-colors shadow-sm active:scale-95">
                          <span>View Graph</span>
                          <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Infinite scroll sentinel & indicators */}
            <div ref={browserSentinelRef} className="h-1 w-full pointer-events-none mt-2" />
            {isFetchingNextPage && (
              <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-[#a1a1aa]">
                <Loader2 size={14} className="animate-spin text-primary" />
                <span>Loading more knowledge graphs...</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── MODE 2: SINGLE GRAPH VIEWER ── */
        <div
          ref={containerCallbackRef}
          className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col bg-slate-100/50 dark:bg-[#0d0d0f] cursor-grab active:cursor-grabbing"
        >
          {/* Loading Graph Canvas Overlay */}
          {isLoadingGraph && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/95 dark:bg-[#0d0d0f]/95">
              <div className="w-8 h-8 border-2 border-slate-200 dark:border-[#27272a] border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-slate-600 dark:text-[#a1a1aa] font-mono">
                Synthesizing {selectedGraphMeta?.title || 'neural graph'}...
              </span>
            </div>
          )}

          {/* Error Canvas Overlay */}
          {!isLoadingGraph && isErrorGraph && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8 text-center bg-white/95 dark:bg-[#0d0d0f]/95">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#18181b] border border-red-500/30 flex items-center justify-center mb-4 text-red-500 dark:text-[#ef4444]">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-[#f4f4f5] mb-1">Failed to load graph</h3>
              <p className="text-xs text-slate-500 dark:text-[#71717a] max-w-[340px] mb-4">
                {(errorGraph as any)?.message || 'An error occurred while fetching graph data.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBackToBrowser}
                  className="px-4 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] text-slate-800 dark:text-[#f4f4f5] transition-colors cursor-pointer"
                >
                  Back to graphs
                </button>
                <button
                  type="button"
                  onClick={() => refetchGraph()}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-full bg-primary text-white font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  <RotateCw size={13} />
                  <span>Try Again</span>
                </button>
              </div>
            </div>
          )}

          {/* Empty Graph Overlay */}
          {!isLoadingGraph && !isErrorGraph && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8 text-center select-none bg-white/95 dark:bg-[#0d0d0f]/95">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] flex items-center justify-center mb-4 text-slate-400 dark:text-[#71717a]">
                <Network size={28} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#f4f4f5] mb-1.5">This graph has no nodes</h3>
              <p className="text-xs text-slate-600 dark:text-[#71717a] max-w-[380px] leading-relaxed mb-4">
                No entities were extracted from this source yet. Try running another research query or
                re-indexing the source.
              </p>
              <button
                type="button"
                onClick={handleBackToBrowser}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-white text-xs font-semibold cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Return to graph browser</span>
              </button>
            </div>
          )}

          {/* Floating Node Inspector Drawer */}
          {inspectedNode && !isLoadingGraph && (
            <div className="absolute top-4 right-4 z-20 w-[280px] sm:w-[320px] rounded-[32px] sm:rounded-[36px] bg-white/95 dark:bg-[#141416]/95 backdrop-blur-xl border border-slate-200 dark:border-[#27272a] p-5 text-xs select-none shadow-[0_16px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.8)]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider mb-1"
                    style={{
                      backgroundColor: `${getNodeColor(inspectedNode.type, isLight)}22`,
                      color: getNodeColor(inspectedNode.type, isLight),
                      border: `1px solid ${getNodeColor(inspectedNode.type, isLight)}44`,
                    }}
                  >
                    {inspectedNode.type || 'Entity'}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={inspectedNode.label}>
                    {inspectedNode.label || inspectedNode.id}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedNode(null)}
                  className="p-1 rounded-full text-slate-400 dark:text-[#71717a] hover:text-slate-700 dark:hover:text-[#f4f4f5] hover:bg-slate-100 dark:hover:bg-[#202024] transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Connected Relations in this graph */}
              <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-[#27272a]">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-[#71717a] tracking-wider block mb-1.5">
                  Connected Concepts ({inspectedNodeNeighbors.length})
                </span>
                {inspectedNodeNeighbors.length === 0 ? (
                  <p className="text-[11px] text-slate-500 dark:text-[#71717a] italic">No direct connections in this subgraph</p>
                ) : (
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto sidebar-scroll pr-1">
                    {inspectedNodeNeighbors.map((nbr, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          const neighborNode: any = graphData.nodes.find((n: any) => n.label === nbr.label || n.id === nbr.label);
                          if (neighborNode && fgRef.current) {
                            fgRef.current.centerAt(neighborNode.x, neighborNode.y, 400);
                            fgRef.current.zoom(2.5, 400);
                            setInspectedNode(neighborNode);
                          }
                        }}
                        className="flex items-center justify-between px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#18181b] hover:bg-slate-200 dark:hover:bg-[#202024] border border-slate-200 dark:border-[#27272a] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: getNodeColor(nbr.type, isLight) }}
                          />
                          <span className="text-[11px] text-slate-800 dark:text-[#f4f4f5] truncate max-w-[150px]">
                            {nbr.label}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-500 dark:text-[#71717a] uppercase font-mono tracking-wider shrink-0">
                          {nbr.rel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Floating Quick Legend */}
          {!isLoadingGraph && !isErrorGraph && graphData.nodes.length > 0 && (
            <div className="flex lg:hidden absolute top-3 left-3 z-10 flex-wrap items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-[#141416]/90 backdrop-blur-md border border-slate-200 dark:border-[#27272a]">
              {TYPE_CONFIG.map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1 text-[9px] text-slate-600 dark:text-[#a1a1aa]">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span>{label}</span>
                </span>
              ))}
            </div>
          )}

          {/* ForceGraph2D Canvas */}
          {!isErrorGraph && graphData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              backgroundColor={isLight ? '#f8fafc' : '#0d0d0f'}
              nodeLabel="label"
              nodeRelSize={7}
              linkColor={() => (isLight ? 'rgba(148, 163, 184, 0.6)' : 'rgba(113, 113, 122, 0.45)')}
              linkWidth={1.8}
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                const bckgDimensions = node.__bckgDimensions;
                if (bckgDimensions) {
                  ctx.fillStyle = color;
                  const [w, h] = bckgDimensions;
                  const r = h / 2;
                  ctx.beginPath();
                  if (ctx.roundRect) {
                    ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, r);
                  } else {
                    const x = node.x - w / 2;
                    const y = node.y - h / 2;
                    ctx.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
                    ctx.arc(x + w - r, y + r, r, (3 * Math.PI) / 2, Math.PI / 2);
                    ctx.closePath();
                  }
                  ctx.fill();
                }
              }}
              onNodeClick={(node: any) => {
                if (fgRef.current && node.x !== undefined && node.y !== undefined) {
                  fgRef.current.centerAt(node.x, node.y, 400);
                  fgRef.current.zoom(2.5, 400);
                  setInspectedNode(node);
                }
              }}
              d3AlphaDecay={0.015}
              d3VelocityDecay={0.3}
              cooldownTicks={120}
              onEngineStop={() => {
                fgRef.current?.zoomToFit(400, 50);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
