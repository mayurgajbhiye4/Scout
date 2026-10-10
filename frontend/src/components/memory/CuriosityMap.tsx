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
  Sparkles,
} from 'lucide-react';
import { knowledgeApi } from '@/api/knowledge';
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
  { type: 'Concept', color: '#FBBF24', label: 'Concept' },
];

export default function CuriosityMap({ fullscreen = false, onClose }: CuriosityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['full-knowledge-graph'],
    queryFn: () => knowledgeApi.getKnowledgeGraph(),
  });

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
  }, [fullscreen]);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };

    return {
      nodes: (data.nodes || []).map((n) => ({
        ...n,
        val: n.type === 'User' ? 30 : n.type === 'Document' ? 20 : 14,
      })),
      links: (data.edges || []).map((e) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      })),
    };
  }, [data]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label || node.id;
      const fontSize = Math.max(10 / globalScale, 12 / globalScale);
      ctx.font = `${fontSize}px Inter, -apple-system, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const bckgWidth = textWidth + fontSize * 0.8;
      const bckgHeight = fontSize * 1.5;

      // Node pill background
      ctx.fillStyle = 'rgba(17, 17, 22, 0.92)';
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
      ctx.lineWidth = 1.5 / globalScale;
      if (node.type === 'User') ctx.strokeStyle = '#38BDF8';
      else if (node.type === 'Document') ctx.strokeStyle = '#60A5FA';
      else if (node.type === 'Person') ctx.strokeStyle = '#34D399';
      else if (node.type === 'Technology') ctx.strokeStyle = '#F43F5E';
      else ctx.strokeStyle = '#FBBF24';

      ctx.stroke();

      // Text label
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#F4F4F5';
      ctx.fillText(label, node.x, node.y);

      node.__bckgDimensions = [bckgWidth, bckgHeight];
    },
    []
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

  const hasContent =
    graphData.nodes.length > 1 || (graphData.nodes.length === 1 && graphData.links.length > 0);

  // If not fullscreen, render compact embedded card
  if (!fullscreen) {
    return (
      <div className="w-full bg-[#111114] border border-[#27272A] rounded-2xl overflow-hidden shadow-sm relative group h-[250px]">
        <div className="absolute top-3 left-4 z-10 pointer-events-none flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <h3 className="text-xs font-semibold text-[#F4F4F5] tracking-wide bg-[#111114]/80 backdrop-blur px-2 py-0.5 rounded border border-[#27272A]">
            Neural Graph
          </h3>
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

  // Full-screen window mode matching LandingSessionsWindow & LandingSourcesWindow
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
      {/* ── AMBIENT BLUE GLOW ── */}
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

      {/* ── TOP HEADER BAR ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-white/[0.08] shrink-0 backdrop-blur-md select-none z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore */}
          {onClose && (
            <>
              <button
                type="button"
                onClick={onClose}
                title="Back to explore"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] border border-transparent hover:border-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Explore</span>
              </button>
              <div className="h-4 w-px bg-white/10 shrink-0" />
            </>
          )}

          {/* Title & Count Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <Network size={16} className="text-sky-400 shrink-0" />
            <h2 className="text-sm font-semibold text-[#F4F4F5] tracking-tight truncate">
              Knowledge Graph
            </h2>
            {graphData.nodes.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 border border-white/12 text-[#A1A1AA]">
                {graphData.nodes.length} nodes · {graphData.links.length} edges
              </span>
            )}
          </div>
        </div>

        {/* Controls: Type Legend, Zoom Fit, Refresh */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Entity Type Legend Chips */}
          <div className="hidden lg:flex items-center gap-2.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10">
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

          {/* Reset / Fit View Button */}
          <button
            type="button"
            onClick={handleFit}
            title="Fit to Screen"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">Fit</span>
          </button>

          {/* Refresh Graph Button */}
          <button
            type="button"
            onClick={() => refetch()}
            title="Refresh Knowledge Graph"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <RotateCw size={13} className={cn(isFetching && 'animate-spin text-sky-400')} />
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT / CANVAS AREA ── */}
      {isLoading ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-white/10 border-t-sky-400 rounded-full animate-spin" />
          <span className="text-xs text-[#A1A1AA]">Synthesizing neural knowledge graph...</span>
        </div>
      ) : isError ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-sm font-medium text-[#F4F4F5] mb-1">Failed to load knowledge graph</h3>
          <p className="text-xs text-[#71717A] max-w-[340px] mb-4">
            {(error as any)?.message || 'An error occurred while fetching graph data.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-[#F4F4F5] transition-all cursor-pointer"
          >
            <RotateCw size={13} />
            <span>Try Again</span>
          </button>
        </div>
      ) : !hasContent ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4 text-[#71717A]">
            <Network size={28} className="text-sky-400/60" />
          </div>
          <h3 className="text-base font-semibold text-[#F4F4F5] mb-1.5">
            Your knowledge graph is empty
          </h3>
          <p className="text-xs text-[#71717A] max-w-[420px] leading-relaxed mb-4">
            Drop a link, upload a document, or run a research session. Scout will extract entities,
            concepts, and semantic connections into your neural brain.
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-medium hover:bg-[#F4F4F5] active:scale-95 transition-all shadow-[0_2px_10px_rgba(255,255,255,0.18)] cursor-pointer"
            >
              <Sparkles size={13} />
              <span>Explore Research Studio</span>
            </button>
          )}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 w-full cursor-grab active:cursor-grabbing overflow-hidden bg-[#0A0A0E]/50"
        >
          {/* Floating Canvas Controls */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 p-1 rounded-full bg-[#111114]/80 backdrop-blur-md border border-white/10 shadow-lg select-none">
            <button
              type="button"
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1.5 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1.5 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
            <div className="h-3.5 w-px bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={handleFit}
              title="Fit to Window"
              className="p-1.5 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Floating Mobile/Tablet Legend */}
          <div className="flex lg:hidden absolute top-3 left-3 z-10 flex-wrap items-center gap-2 px-2.5 py-1 rounded-full bg-[#111114]/80 backdrop-blur-md border border-white/10">
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

          {dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              nodeLabel="label"
              nodeRelSize={7}
              linkColor={() => 'rgba(82, 82, 91, 0.45)'}
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
