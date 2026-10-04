import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '@/api/knowledge';

export default function CuriosityMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 250 });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['full-knowledge-graph'],
    queryFn: () => knowledgeApi.getKnowledgeGraph(),
  });

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth } = containerRef.current;
      setDimensions({ width: clientWidth || 560, height: 250 });
      
      const handleResize = () => {
        if (containerRef.current) {
          setDimensions({ width: containerRef.current.clientWidth || 560, height: 250 });
        }
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    
    return {
      nodes: (data.nodes || []).map(n => ({
        ...n,
        // D3 force simulation requires a numeric value for scaling
        val: n.type === 'User' ? 28 : n.type === 'Document' ? 18 : 12
      })),
      links: (data.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship
      }))
    };
  }, [data]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label || node.id;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    const textWidth = ctx.measureText(label).width;
    const bckgWidth = textWidth + fontSize * 0.4;
    const bckgHeight = fontSize * 1.3;

    ctx.fillStyle = 'rgba(28, 28, 34, 0.85)'; // #1C1C22
    ctx.beginPath();
    ctx.roundRect(
      node.x - bckgWidth / 2,
      node.y - bckgHeight / 2,
      bckgWidth,
      bckgHeight,
      4 / globalScale // border radius
    );
    ctx.fill();
    
    // Border based on type
    ctx.lineWidth = 1 / globalScale;
    if (node.type === 'User') ctx.strokeStyle = '#38BDF8'; // Sky Blue
    else if (node.type === 'Document') ctx.strokeStyle = '#60A5FA'; // Light Blue
    else if (node.type === 'Person') ctx.strokeStyle = '#34D399'; // Emerald
    else if (node.type === 'Technology') ctx.strokeStyle = '#F43F5E'; // Rose
    else ctx.strokeStyle = '#FBBF24'; // Amber / Concept
    
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F4F4F5';
    ctx.fillText(label, node.x, node.y);
    
    node.__bckgDimensions = [bckgWidth, bckgHeight];
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-[250px] bg-[#111114] border border-[#27272A] rounded-xl flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-[#3F3F46] border-t-[#38BDF8] rounded-full animate-spin" />
        <span className="text-xs text-[#71717A]">Loading neural graph...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full bg-[#111114] border border-rose-900/40 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center py-10 text-[#71717A]">
        <p className="text-sm text-rose-400 font-medium">Failed to load knowledge graph</p>
        <p className="text-xs text-[#71717A] mt-1 mb-3">{(error as any)?.message || 'An error occurred while fetching graph data.'}</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1 text-xs rounded bg-[#1C1C22] border border-[#27272A] text-[#E4E4E7] hover:border-sky-400/50 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const hasContent = graphData.nodes.length > 1 || (graphData.nodes.length === 1 && graphData.links.length > 0);

  if (!hasContent) {
    return (
      <div className="w-full bg-[#111114] border border-[#27272A] rounded-xl p-5 shadow-sm flex flex-col items-center justify-center py-12 text-[#71717A]">
        <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        <p className="text-sm font-medium text-[#A1A1AA]">Your knowledge graph is empty.</p>
        <p className="text-xs mt-1">Drop a link, upload a source, or ask a question to start building your neural brain.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#111114] border border-[#27272A] rounded-xl overflow-hidden shadow-sm relative group">
      <div className="absolute top-3 left-4 z-10 pointer-events-none flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
        <h3 className="text-xs font-semibold text-[#F4F4F5] tracking-wide bg-[#111114]/80 backdrop-blur px-2 py-0.5 rounded border border-[#27272A]">
          Your Neural Graph
        </h3>
      </div>
      <div ref={containerRef} className="w-full h-full min-h-[250px] cursor-grab active:cursor-grabbing">
        {dimensions.width > 0 && (
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
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            cooldownTicks={100}
            onEngineStop={() => {
              fgRef.current?.zoomToFit(400, 20);
            }}
          />
        )}
      </div>
    </div>
  );
}
