import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { knowledgeApi, GraphSummary } from '@/api/knowledge';
import { cn } from '@/lib/utils';

interface CuriosityMapProps {
  fullscreen?: boolean;
  onClose?: () => void;
}

const TYPE_CONFIG = [
  { type: 'User', color: '#38BDF8', label: 'You' },
  { type: 'Document', color: '#60A5FA', label: 'Document' },
  { type: 'Person', color: '#34D399', label: 'Person' },
  { type: 'Technology', color: '#F43F5E', label: 'Technology' },
  { type: 'Architecture', color: '#A855F7', label: 'Architecture' },
  { type: 'Concept', color: '#FBBF24', label: 'Concept' },
];

function getNodeColor(type: string): string {
  switch (type?.toLowerCase()) {
    case 'user':
      return '#38BDF8';
    case 'document':
    case 'source':
      return '#60A5FA';
    case 'person':
      return '#34D399';
    case 'technology':
    case 'aisystem':
      return '#F43F5E';
    case 'architecture':
    case 'researchpaper':
    case 'publication':
      return '#A855F7';
    case 'platform':
    case 'organization':
      return '#38BDF8';
    default:
      return '#FBBF24';
  }
}

export default function CuriosityMap({ fullscreen = false, onClose }: CuriosityMapProps) {
  // Graph Browser navigation state: null = browsing list, string = viewing that specific graph
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [selectedGraphMeta, setSelectedGraphMeta] = useState<GraphSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'universal' | 'document' | 'memory'>('all');
  const [inspectedNode, setInspectedNode] = useState<any | null>(null);

  // Canvas refs and sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // 1. Fetch available graphs list
  const {
    data: graphsList,
    isLoading: isLoadingList,
    isError: isErrorList,
    error: errorList,
    refetch: refetchList,
    isFetching: isFetchingList,
  } = useQuery({
    queryKey: ['knowledge-graphs-list'],
    queryFn: () => knowledgeApi.listGraphs(),
  });

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

  // Measure canvas dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      if (el) {
        setDimensions({
          width: el.clientWidth || 800,
          height: el.clientHeight || (fullscreen ? 650 : 250),
        });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen, selectedGraphId]);

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

  // Custom Canvas Node Rendering
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label || node.id;
      const fontSize = Math.max(10 / globalScale, 12 / globalScale);
      ctx.font = `${fontSize}px Inter, -apple-system, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const bckgWidth = textWidth + fontSize * 0.9;
      const bckgHeight = fontSize * 1.6;

      const isInspected = inspectedNode?.id === node.id;

      // Node pill background
      ctx.fillStyle = isInspected ? 'rgba(30, 41, 59, 0.98)' : 'rgba(15, 15, 20, 0.92)';
      ctx.beginPath();
      ctx.roundRect(
        node.x - bckgWidth / 2,
        node.y - bckgHeight / 2,
        bckgWidth,
        bckgHeight,
        6 / globalScale
      );
      ctx.fill();

      // Border matching node entity type
      ctx.lineWidth = (isInspected ? 2.5 : 1.5) / globalScale;
      ctx.strokeStyle = isInspected ? '#38BDF8' : getNodeColor(node.type);
      ctx.stroke();

      // Text label
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isInspected ? '#FFFFFF' : '#F4F4F5';
      ctx.fillText(label, node.x, node.y);

      node.__bckgDimensions = [bckgWidth, bckgHeight];
    },
    [inspectedNode]
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
      return <Globe size={16} className="text-emerald-400" />;
    }
    return <FileText size={16} className="text-blue-400" />;
  };

  // Compact embedded mode (if mounted without fullscreen)
  if (!fullscreen) {
    return (
      <div className="w-full bg-[#111114] border border-[#27272A] rounded-2xl overflow-hidden shadow-sm relative group h-[250px]">
        <div className="absolute top-3 left-4 z-10 flex items-center justify-between right-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <h3 className="text-xs font-semibold text-[#F4F4F5] tracking-wide bg-[#111114]/80 backdrop-blur px-2 py-0.5 rounded border border-[#27272A]">
              Neural Knowledge Graphs
            </h3>
          </div>
          <span className="text-[11px] text-[#A1A1AA] bg-white/[0.04] px-2 py-0.5 rounded border border-white/5">
            {stats.totalGraphs} graphs available
          </span>
        </div>
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing">
          {dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              nodeLabel="label"
              nodeRelSize={6}
              linkColor={() => 'rgba(82, 82, 91, 0.4)'}
              linkWidth={1.5}
              nodeCanvasObject={paintNode}
            />
          )}
        </div>
      </div>
    );
  }

  // Full-screen window mode matching LandingSessionsWindow & LandingSourcesWindow liquid glass style
  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 w-full max-w-[980px] h-full max-h-[1000px] my-auto flex flex-col',
        'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
        'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
        'shadow-[var(--pill-shadow)]',
        'rounded-[34px] overflow-hidden',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'animate-in fade-in zoom-in-95 duration-200'
      )}
    >
      {/* ── AMBIENT AMBIENCE GLOW ── */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
        aria-hidden="true"
        style={{
          width: '120vw',
          height: '100vh',
          background:
            'radial-gradient(ellipse at center, rgba(22, 116, 210, 0.12) 0%, rgba(13, 98, 184, 0.05) 30%, rgba(12, 89, 213, 0.03) 50%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* ── HEADER NAVIGATION BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-white/[0.08] shrink-0 backdrop-blur-md select-none z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          {selectedGraphId ? (
            <button
              type="button"
              onClick={handleBackToBrowser}
              title="Back to all graphs"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#F4F4F5] bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 transition-all cursor-pointer active:scale-95 shrink-0 shadow-sm"
            >
              <ArrowLeft size={14} className="text-sky-400" />
              <span>All Graphs</span>
            </button>
          ) : onClose ? (
            <button
              type="button"
              onClick={onClose}
              title="Back to explore"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] border border-transparent hover:border-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Explore</span>
            </button>
          ) : null}

          {(selectedGraphId || onClose) && <div className="h-4 w-px bg-white/10 shrink-0" />}

          {/* Title & Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <Network size={16} className="text-sky-400 shrink-0" />
            <h2 className="text-sm font-semibold text-[#F4F4F5] tracking-tight truncate max-w-[280px] sm:max-w-[420px]">
              {selectedGraphMeta ? selectedGraphMeta.title : 'Knowledge Graph Browser'}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 border border-white/12 text-[#A1A1AA] shrink-0">
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
              <div className="hidden xl:flex items-center gap-2.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10">
                {TYPE_CONFIG.map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-[10px] text-[#A1A1AA]">
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Maximize2 size={13} />
                <span className="hidden sm:inline">Fit</span>
              </button>

              {/* Zoom buttons */}
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In"
                className="p-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out"
                className="p-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <ZoomOut size={13} />
              </button>

              {/* Refresh single graph button */}
              <button
                type="button"
                onClick={() => refetchGraph()}
                title="Refresh Graph"
                className="p-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <RotateCw size={13} className={cn(isFetchingGraph && 'animate-spin text-sky-400')} />
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <RotateCw size={12} className={cn(isFetchingList && 'animate-spin text-sky-400')} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── MODE 1: GRAPH BROWSER / GALLERY (BROWSE ALL GRAPHS) ── */}
      {!selectedGraphId ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 sidebar-scroll flex flex-col gap-5">
          {/* ── SEARCH & FILTER CONTROLS ── */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search graphs by title, source, or concept..."
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-[#F4F4F5] placeholder-[#71717A] border border-white/[0.08] focus:border-sky-400/50 outline-none transition-all shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#F4F4F5] p-0.5 rounded cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] self-start sm:self-auto overflow-x-auto max-w-full">
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
                    'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                    activeFilter === tab.id
                      ? 'bg-white/15 text-[#F4F4F5] shadow-xs border border-white/10'
                      : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.05]'
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] animate-pulse space-y-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-white/10" />
                    <div className="h-4 bg-white/10 rounded-full w-20" />
                  </div>
                  <div className="h-4 bg-white/10 rounded w-4/5" />
                  <div className="h-3 bg-white/5 rounded w-full" />
                  <div className="flex gap-1.5 pt-1">
                    <div className="h-5 bg-white/5 rounded-full w-16" />
                    <div className="h-5 bg-white/5 rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : isErrorList ? (
            /* Error State */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle size={32} className="text-[#EF4444] mb-2" />
              <p className="text-sm font-medium text-[#F4F4F5]">Failed to load knowledge graphs</p>
              <p className="text-xs text-[#71717A] mt-1 mb-4">
                {(errorList as any)?.message || 'Check your database connection'}
              </p>
              <button
                type="button"
                onClick={() => refetchList()}
                className="px-3.5 py-1.5 rounded-full text-xs bg-white/10 hover:bg-white/15 text-[#F4F4F5] border border-white/10 transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredGraphs.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3 text-[#A1A1AA]">
                <Network size={26} className="text-sky-400/70" />
              </div>
              <h3 className="text-sm font-semibold text-[#F4F4F5] mb-1">
                {searchQuery ? 'No matching graphs found' : 'No knowledge graphs yet'}
              </h3>
              <p className="text-xs text-[#A1A1AA] max-w-sm mb-4 leading-relaxed">
                {searchQuery
                  ? `No graphs match "${searchQuery}". Try searching for another concept or clear the search.`
                  : 'Ingest research sources (PDFs, YouTube videos, web links) to automatically generate neural knowledge graphs.'}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/[0.08] hover:bg-white/[0.14] text-[#F4F4F5] border border-white/10 transition-all cursor-pointer"
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
                      'group relative flex flex-col justify-between p-4.5 rounded-2xl transition-all duration-200 cursor-pointer active:scale-[0.99] select-none',
                      'border shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]',
                      isUniversal
                        ? 'bg-gradient-to-br from-sky-500/[0.07] via-white/[0.03] to-transparent border-sky-500/25 hover:border-sky-400/50 hover:bg-sky-500/[0.10]'
                        : isMemory
                        ? 'bg-gradient-to-br from-amber-500/[0.07] via-white/[0.03] to-transparent border-amber-500/25 hover:border-amber-400/50 hover:bg-amber-500/[0.10]'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/20'
                    )}
                  >
                    <div>
                      {/* Top Row: Icon Badge & Node Stats */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-110',
                            isUniversal
                              ? 'bg-sky-500/15 border-sky-400/30'
                              : isMemory
                              ? 'bg-amber-500/15 border-amber-400/30'
                              : 'bg-white/[0.06] border-white/10'
                          )}
                        >
                          {getGraphIcon(graph.type, graph.title)}
                        </div>

                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] border border-white/10 text-[#A1A1AA]">
                          <span>{graph.node_count} nodes</span>
                          <span className="opacity-40">·</span>
                          <span>{graph.edge_count} edges</span>
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-[#F4F4F5] group-hover:text-white transition-colors line-clamp-2 leading-snug mb-1.5">
                        {graph.title}
                      </h3>

                      {/* Description */}
                      {graph.description && (
                        <p className="text-xs text-[#71717A] line-clamp-2 leading-relaxed mb-3">
                          {graph.description}
                        </p>
                      )}

                      {/* Top Entities Tags */}
                      {graph.top_entities && graph.top_entities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {graph.top_entities.slice(0, 4).map((ent, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white/[0.04] text-[#A1A1AA] border border-white/[0.06] group-hover:border-white/12 transition-colors max-w-[150px] truncate"
                              title={ent}
                            >
                              <span className="w-1 h-1 rounded-full bg-sky-400/70 shrink-0" />
                              <span className="truncate">{ent}</span>
                            </span>
                          ))}
                          {graph.top_entities.length > 4 && (
                            <span className="px-1.5 py-0.5 text-[9px] text-[#71717A]">
                              +{graph.top_entities.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Action */}
                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#A1A1AA] group-hover:text-[#F4F4F5] transition-colors">
                      <span className="text-[11px] capitalize font-medium text-[#71717A]">
                        {isUniversal ? 'Universal Brain' : isMemory ? 'Neural Mindmap' : 'Document Subgraph'}
                      </span>
                      <div className="flex items-center gap-1 text-xs font-semibold text-sky-400 group-hover:translate-x-0.5 transition-transform">
                        <span>View Graph</span>
                        <ArrowRight size={12} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── MODE 2: SINGLE GRAPH VIEWER ── */
        <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col bg-[#08080C]/70">
          {isLoadingGraph ? (
            /* Loading Graph Canvas */
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-white/10 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-xs text-[#A1A1AA]">
                Synthesizing {selectedGraphMeta?.title || 'neural graph'}...
              </span>
            </div>
          ) : isErrorGraph ? (
            /* Error Canvas */
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-sm font-medium text-[#F4F4F5] mb-1">Failed to load graph</h3>
              <p className="text-xs text-[#71717A] max-w-[340px] mb-4">
                {(errorGraph as any)?.message || 'An error occurred while fetching graph data.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBackToBrowser}
                  className="px-3.5 py-1.5 text-xs rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-[#F4F4F5] transition-all cursor-pointer"
                >
                  Back to graphs
                </button>
                <button
                  type="button"
                  onClick={() => refetchGraph()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full bg-white text-black font-semibold hover:bg-[#F4F4F5] transition-all cursor-pointer"
                >
                  <RotateCw size={13} />
                  <span>Try Again</span>
                </button>
              </div>
            </div>
          ) : graphData.nodes.length === 0 ? (
            /* Empty Graph */
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4 text-[#71717A]">
                <Network size={28} className="text-sky-400/60" />
              </div>
              <h3 className="text-base font-semibold text-[#F4F4F5] mb-1.5">This graph has no nodes</h3>
              <p className="text-xs text-[#71717A] max-w-[380px] leading-relaxed mb-4">
                No entities were extracted from this source yet. Try running another research query or
                re-indexing the source.
              </p>
              <button
                type="button"
                onClick={handleBackToBrowser}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-[#F4F4F5] text-xs font-semibold cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Return to graph browser</span>
              </button>
            </div>
          ) : (
            /* ── INTERACTIVE CANVAS VIEW ── */
            <div
              ref={containerRef}
              className="relative flex-1 min-h-0 w-full cursor-grab active:cursor-grabbing overflow-hidden"
            >
              {/* Floating Node Inspector Drawer */}
              {inspectedNode && (
                <div className="absolute top-4 right-4 z-20 w-[280px] sm:w-[320px] rounded-2xl bg-[#111116]/95 backdrop-blur-xl border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.6)] p-3.5 text-xs animate-in fade-in slide-in-from-top-2 duration-150 select-none">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider mb-1"
                        style={{
                          backgroundColor: `${getNodeColor(inspectedNode.type)}22`,
                          color: getNodeColor(inspectedNode.type),
                          border: `1px solid ${getNodeColor(inspectedNode.type)}44`,
                        }}
                      >
                        {inspectedNode.type || 'Entity'}
                      </span>
                      <h4 className="text-sm font-semibold text-white truncate" title={inspectedNode.label}>
                        {inspectedNode.label || inspectedNode.id}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectedNode(null)}
                      className="p-1 rounded-md text-[#71717A] hover:text-[#F4F4F5] hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Connected Relations in this graph */}
                  <div className="mt-2.5 pt-2 border-t border-white/10">
                    <span className="text-[10px] uppercase font-semibold text-[#71717A] tracking-wider block mb-1.5">
                      Connected Concepts ({inspectedNodeNeighbors.length})
                    </span>
                    {inspectedNodeNeighbors.length === 0 ? (
                      <p className="text-[11px] text-[#71717A] italic">No direct connections in this subgraph</p>
                    ) : (
                      <div className="space-y-1 max-h-[140px] overflow-y-auto sidebar-scroll pr-1">
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
                            className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: getNodeColor(nbr.type) }}
                              />
                              <span className="text-[11px] text-[#F4F4F5] truncate max-w-[150px]">
                                {nbr.label}
                              </span>
                            </div>
                            <span className="text-[9px] text-[#71717A] uppercase font-mono tracking-wider shrink-0">
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
              <div className="flex lg:hidden absolute top-3 left-3 z-10 flex-wrap items-center gap-2 px-2.5 py-1 rounded-full bg-[#111114]/85 backdrop-blur-md border border-white/10">
                {TYPE_CONFIG.map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1 text-[9px] text-[#A1A1AA]">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>{label}</span>
                  </span>
                ))}
              </div>

              {/* ForceGraph2D Canvas */}
              {dimensions.width > 0 && dimensions.height > 0 && (
                <ForceGraph2D
                  ref={fgRef}
                  width={dimensions.width}
                  height={dimensions.height}
                  graphData={graphData}
                  nodeLabel="label"
                  nodeRelSize={7}
                  linkColor={() => 'rgba(113, 113, 122, 0.45)'}
                  linkWidth={1.8}
                  nodeCanvasObject={paintNode}
                  nodePointerAreaPaint={(node: any, color, ctx) => {
                    const bckgDimensions = node.__bckgDimensions;
                    if (bckgDimensions) {
                      ctx.fillStyle = color;
                      ctx.fillRect(
                        node.x - bckgDimensions[0] / 2,
                        node.y - bckgDimensions[1] / 2,
                        bckgDimensions[0],
                        bckgDimensions[1]
                      );
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
      )}
    </div>
  );
}
