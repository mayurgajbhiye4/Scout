import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { ChevronDown, Loader2, Maximize, MessageSquare, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { Source } from '@/api/sources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';
import { KIND_META, getSourceKind, getSourceTitle, type SourceKind } from '../sourceMeta';
import { useMediaQuery, type WorkspaceGraph, type WorkspaceNode } from '../useWorkspaceData';
import type { EntityFocus } from './SourcesDock';

export type ClusterMode = 'source' | 'type';

type GNode = WorkspaceNode & { r: number };
type GLink = { relationship: string };
type FGNode = NodeObject<GNode>;
type FGLink = LinkObject<GNode, GLink>;

interface GraphCanvasProps {
  graph: WorkspaceGraph;
  sourcesById: Map<string, Source>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  hoveredSourceId: string | null;
  selectedSourceId: string | null;
  selectedEntity: EntityFocus | null;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string | null) => void;
  onSelectEntity: (entity: EntityFocus | null) => void;
  onAsk: (prompt: string) => void;
  onAddSource: () => void;
  clusterMode: ClusterMode;
  onClusterModeChange: (mode: ClusterMode) => void;
  /** Rendered at the start of the header, e.g. a toggle for the sources drawer on small screens. */
  headerStart?: ReactNode;
}

// The map is the one place the UI uses categorical color; teal stays reserved for focus and selection.
// Every entity type has its own shape AND color, so identity never rests on color alone. The four hues
// (blue, yellow, magenta, green) were validated all-pairs for color-vision deficiency on both canvas
// surfaces; no fifth hue clears those floors, so "Paper & architecture" is an outlined shape in ink.
type NodeShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'pentagon';

const BLUE = { light: '#2a78d6', dark: '#3987e5' };
const YELLOW = { light: '#eda100', dark: '#c98500' };
const MAGENTA = { light: '#e87ba4', dark: '#d55181' };
const GREEN = { light: '#008300', dark: '#008300' };
const INK = { light: '#334155', dark: '#e4e4e7' };
const GREY = { light: '#94a3b8', dark: '#71717a' };

interface TypeStyle {
  label: string;
  shape: NodeShape;
  hollow?: boolean;
  dark: string;
  light: string;
}

const TYPE_PALETTE: Array<TypeStyle & { match: string[] }> = [
  { match: ['concept', 'idea', 'method', 'technique'], label: 'Concept', shape: 'circle', ...BLUE },
  { match: ['technology', 'aisystem', 'model', 'tool', 'software', 'library', 'framework'], label: 'Technology', shape: 'hexagon', ...YELLOW },
  { match: ['person', 'author', 'researcher'], label: 'Person', shape: 'triangle', ...MAGENTA },
  { match: ['organization', 'company', 'platform', 'institution'], label: 'Organization', shape: 'diamond', ...GREEN },
  { match: ['architecture', 'researchpaper', 'publication', 'paper', 'dataset'], label: 'Paper & architecture', shape: 'pentagon', hollow: true, ...INK },
];
const OTHER_TYPE: TypeStyle = { label: 'Other', shape: 'circle', ...GREY };

// Grouped by source, color says which kind of source a concept came from (shape still says its type).
const KIND_PAINT: Record<SourceKind, { light: string; dark: string }> = {
  pdf: BLUE,
  youtube: MAGENTA,
  github: GREEN,
  web: YELLOW,
  notes: GREY,
};
const KIND_ORDER: SourceKind[] = ['pdf', 'youtube', 'github', 'web', 'notes'];

// Polygons are scaled to the same area as a circle of radius r, so no type looks bigger than another.
const POLYGONS: Record<Exclude<NodeShape, 'circle' | 'square'>, { sides: number; scale: number; rotation: number }> = {
  triangle: { sides: 3, scale: 1.555, rotation: -Math.PI / 2 },
  diamond: { sides: 4, scale: 1.253, rotation: -Math.PI / 2 },
  hexagon: { sides: 6, scale: 1.1, rotation: 0 },
  pentagon: { sides: 5, scale: 1.149, rotation: -Math.PI / 2 },
};
const SQUARE_HALF = 0.92;
// Horizontal reach of each shape (in radii), so side labels clear the mark
const SHAPE_REACH: Record<NodeShape, number> = { circle: 1, square: SQUARE_HALF, triangle: 1.35, diamond: 1.253, hexagon: 1.1, pentagon: 1.09 };

function polygonPoints(shape: keyof typeof POLYGONS, x: number, y: number, r: number, grow = 0): Array<[number, number]> {
  const { sides, scale, rotation } = POLYGONS[shape];
  const radius = scale * r + grow;
  return Array.from({ length: sides }, (_, i) => {
    const a = rotation + (i * 2 * Math.PI) / sides;
    return [x + radius * Math.cos(a), y + radius * Math.sin(a)];
  });
}

/** Adds the outline of a node's shape to the current path; `grow` widens it for rings. */
function traceShape(ctx: CanvasRenderingContext2D, shape: NodeShape, x: number, y: number, r: number, grow = 0) {
  if (shape === 'circle') {
    ctx.arc(x, y, r + grow, 0, Math.PI * 2);
  } else if (shape === 'square') {
    const half = SQUARE_HALF * r + grow;
    ctx.roundRect(x - half, y - half, half * 2, half * 2, half * 0.38);
  } else {
    const points = polygonPoints(shape, x, y, r, grow);
    ctx.moveTo(points[0]![0], points[0]![1]);
    for (const [px, py] of points.slice(1)) ctx.lineTo(px, py);
    ctx.closePath();
  }
}

/** The same shape as a small inline SVG, for the legend and inspector. */
function ShapeSwatch({ shape, color, hollow, size = 14 }: { shape: NodeShape; color: string; hollow?: boolean; size?: number }) {
  // Sized so each shape nearly fills the 12-unit box; the triangle sits low so its centroid looks centred
  const r = 4.3;
  const paint = hollow ? { fill: 'none', stroke: color, strokeWidth: 1.5 } : { fill: color };
  const half = SQUARE_HALF * (r + 0.7);
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {shape === 'circle' ? (
        <circle cx={6} cy={6} r={hollow ? r : r + 0.6} {...paint} />
      ) : shape === 'square' ? (
        <rect x={6 - half} y={6 - half} width={half * 2} height={half * 2} rx={1.6} {...paint} />
      ) : (
        <polygon
          points={polygonPoints(shape, 6, shape === 'triangle' ? 7.2 : 6, hollow ? r - 0.5 : r).map((p) => p.join(',')).join(' ')}
          {...paint}
        />
      )}
    </svg>
  );
}

function typeBucket(type: string) {
  const t = (type || '').toLowerCase();
  return TYPE_PALETTE.find((p) => p.match.includes(t)) ?? OTHER_TYPE;
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function endpointId(end: FGLink['source']): string {
  return typeof end === 'object' && end !== null ? String(end.id) : String(end);
}

export default function GraphCanvas({
  graph,
  sourcesById,
  isAuthenticated,
  isLoading,
  isError,
  isFetching,
  onRetry,
  hoveredSourceId,
  selectedSourceId,
  selectedEntity,
  onHoverSource,
  onSelectSource,
  onSelectEntity,
  onAsk,
  onAddSource,
  clusterMode,
  onClusterModeChange,
  headerStart,
}: GraphCanvasProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const palette = useMemo(
    () =>
      isLight
        ? { bg: '#f4f6f9', ink: '#0f172a', inkSoft: '#475569', line: '#94a3b8', accent: '#0d9488', ring: '#0f172a', source: '#0f172a' }
        : { bg: '#09090b', ink: '#f4f4f5', inkSoft: '#a1a1aa', line: '#52525b', accent: '#14b8a6', ring: '#f4f4f5', source: '#f4f4f5' },
    [isLight]
  );

  // ── Sizing (debounced so split-view resizes don't thrash the canvas) ──
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const width = Math.floor(el.clientWidth);
      const height = Math.floor(el.clientHeight);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => requestAnimationFrame(measure), 90);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  // ── Graph data, keeping node positions across refetches ──
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const graphData = useMemo(() => {
    // Reading the position cache here only seeds the force simulation with last-known coordinates;
    // it never drives what React renders, so a stale read is harmless.
    // eslint-disable-next-line react-hooks/refs
    const nodes: FGNode[] = graph.nodes.map((n) => {
      const r = n.isSource ? 9 + Math.min(8, Math.sqrt(n.degree) * 1.7) : 3.5 + Math.min(5, n.degree * 0.9);
      const prev = positionsRef.current.get(n.id);
      return { ...n, r, ...(prev ? { x: prev.x, y: prev.y } : {}) };
    });
    const links: FGLink[] = graph.links.map((l) => ({ ...l }));
    return { nodes, links };
  }, [graph]);

  const nodesById = useMemo(() => new Map(graphData.nodes.map((n) => [n.id, n])), [graphData]);

  const kindOfSource = useCallback(
    (sourceId: string | undefined): SourceKind => {
      const s = sourceId ? sourcesById.get(sourceId) : undefined;
      return s ? getSourceKind(s) : 'web';
    },
    [sourcesById]
  );

  const kindPaint = useCallback((kind: SourceKind) => (isLight ? KIND_PAINT[kind].light : KIND_PAINT[kind].dark), [isLight]);

  // Sources are rounded squares; concepts take their type's shape. Color follows the grouping:
  // by type, the type's color (sources in ink); by source, the color of the source's kind.
  const nodeStyle = useCallback(
    (n: GNode): { shape: NodeShape; color: string; hollow: boolean } => {
      if (n.isSource) {
        return { shape: 'square', hollow: false, color: clusterMode === 'source' ? kindPaint(kindOfSource(n.id)) : palette.source };
      }
      const bucket = typeBucket(n.type);
      const color = clusterMode === 'source' ? kindPaint(kindOfSource(n.sourceIds[0])) : isLight ? bucket.light : bucket.dark;
      return { shape: bucket.shape, hollow: Boolean(bucket.hollow), color };
    },
    [clusterMode, isLight, kindOfSource, kindPaint, palette]
  );
  const nodeColor = useCallback((n: GNode) => nodeStyle(n).color, [nodeStyle]);

  // ── Highlight: dock/chat hover beats canvas hover beats the persistent selection ──
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const focusRoot =
    (hoveredSourceId && nodesById.has(hoveredSourceId) ? hoveredSourceId : null) ??
    hoverNodeId ??
    (selectedSourceId && nodesById.has(selectedSourceId) ? selectedSourceId : null) ??
    (selectedEntity && nodesById.has(selectedEntity.id) ? selectedEntity.id : null);

  const highlight = useMemo(() => {
    if (!focusRoot) return null;
    const set = new Set<string>([focusRoot]);
    graph.neighbors.get(focusRoot)?.forEach((id) => set.add(id));
    return set;
  }, [focusRoot, graph]);

  // ── Forces: cluster pull toward one centroid per source (or per type) ──
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const hasCanvas = size.width > 0 && graphData.nodes.length > 0;
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !hasCanvas) return;

    const keyOf = (n: GNode) =>
      clusterMode === 'source' ? n.sourceIds[0] ?? '_loose' : n.isSource ? '_sources' : typeBucket(n.type).label;
    const keys = Array.from(new Set(graphData.nodes.map(keyOf))).sort();
    const radius = keys.length <= 1 ? 0 : 70 + 28 * keys.length;
    const centroids = new Map(
      keys.map((k, i) => {
        if (k === '_sources') return [k, { x: 0, y: 0 }];
        const a = (i / keys.length) * Math.PI * 2;
        return [k, { x: Math.cos(a) * radius, y: Math.sin(a) * radius }];
      })
    );

    let simNodes: FGNode[] = [];
    const cluster = Object.assign(
      (alpha: number) => {
        for (const n of simNodes) {
          const c = centroids.get(keyOf(n));
          if (!c || n.x === undefined || n.y === undefined) continue;
          n.vx = (n.vx ?? 0) + (c.x - n.x) * 0.05 * alpha;
          n.vy = (n.vy ?? 0) + (c.y - n.y) * 0.05 * alpha;
        }
      },
      { initialize: (ns: FGNode[]) => (simNodes = ns) }
    );

    fg.d3Force('cluster', cluster);
    fg.d3Force('charge')?.strength?.(-110);
    fg.d3Force('link')?.distance?.((l: FGLink) => {
      const s = typeof l.source === 'object' ? (l.source as FGNode) : undefined;
      return s?.isSource ? 52 : 36;
    });
    fg.d3ReheatSimulation();
  }, [clusterMode, graphData, hasCanvas]);

  // Fit once per data load, after the layout settles.
  const fittedRef = useRef(false);
  useEffect(() => {
    fittedRef.current = false;
  }, [graphData]);
  const handleEngineStop = useCallback(() => {
    for (const n of graphData.nodes) {
      if (n.x !== undefined && n.y !== undefined) positionsRef.current.set(n.id, { x: n.x, y: n.y });
    }
    if (!fittedRef.current) {
      fittedRef.current = true;
      fgRef.current?.zoomToFit(reducedMotion ? 0 : 600, 72);
    }
  }, [graphData, reducedMotion]);

  // Glide to whatever was just selected (from the dock, the chat, or the canvas).
  const selectionId = selectedSourceId ?? selectedEntity?.id ?? null;
  useEffect(() => {
    if (!selectionId) return;
    const n = nodesById.get(selectionId);
    const fg = fgRef.current;
    if (!fg || n?.x === undefined || n?.y === undefined) return;
    fg.centerAt(n.x, n.y, reducedMotion ? 0 : 650);
    if (fg.zoom() < 1.4) fg.zoom(1.6, reducedMotion ? 0 : 650);
  }, [selectionId, nodesById, reducedMotion]);

  // ── Drawing ──
  const drawNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const { shape, color, hollow } = nodeStyle(node);
      const inFocus = highlight ? highlight.has(node.id) : true;
      const isRoot = node.id === focusRoot;
      const isSelected = node.id === selectionId;

      ctx.save();
      ctx.globalAlpha = inFocus ? 1 : 0.16;

      // A ring in the canvas color first, so overlapping marks stay separate
      ctx.beginPath();
      traceShape(ctx, shape, x, y, node.r);
      ctx.strokeStyle = palette.bg;
      ctx.lineWidth = 3 / scale;
      ctx.stroke();

      if (highlight && inFocus) {
        ctx.shadowColor = palette.accent;
        ctx.shadowBlur = isRoot ? 22 : 12;
      } else if (node.isSource) {
        ctx.shadowColor = withAlpha(color, 0.6);
        ctx.shadowBlur = 12;
      }

      ctx.beginPath();
      traceShape(ctx, shape, x, y, node.r);
      if (hollow) {
        ctx.fillStyle = palette.bg;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.4, node.r * 0.32);
        ctx.stroke();
      } else {
        if (node.isSource) {
          const g = ctx.createRadialGradient(x - node.r * 0.35, y - node.r * 0.35, node.r * 0.1, x, y, node.r * 1.2);
          g.addColorStop(0, withAlpha(color, 0.92));
          g.addColorStop(1, color);
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = color;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        // Light canvas: a faint ink edge keeps the paler hues (yellow) defined against the surface
        if (isLight) {
          ctx.strokeStyle = withAlpha(palette.ink, 0.22);
          ctx.lineWidth = 0.8 / scale;
          ctx.stroke();
        }
      }

      // Concepts mentioned by more than one source get an outer ring: they bridge clusters.
      if (!node.isSource && node.sourceIds.length > 1) {
        ctx.beginPath();
        traceShape(ctx, shape, x, y, node.r, 2.4);
        ctx.strokeStyle = withAlpha(palette.ink, 0.55);
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }

      if (highlight && inFocus && !isSelected) {
        ctx.beginPath();
        traceShape(ctx, shape, x, y, node.r, 1.4);
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 1.6 / scale;
        ctx.stroke();
      }

      if (isSelected) {
        ctx.beginPath();
        traceShape(ctx, shape, x, y, node.r, 3.2);
        ctx.strokeStyle = palette.ring;
        ctx.lineWidth = 2.2 / scale;
        ctx.stroke();
      }

      const showLabel = node.isSource || isRoot || (highlight ? inFocus : scale > 1.5);
      if (showLabel) {
        const fontPx = (node.isSource ? 12.5 : 11.5) / Math.max(scale, 0.6);
        ctx.font = `${node.isSource || isRoot ? 600 : 500} ${fontPx}px Inter, ui-sans-serif, system-ui, sans-serif`;
        const text = truncate(node.label, node.isSource ? 30 : 26);
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5 / Math.max(scale, 0.6);
        ctx.strokeStyle = palette.bg;
        ctx.fillStyle = inFocus ? palette.ink : palette.inkSoft;
        if (node.isSource) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const ty = y + node.r * SHAPE_REACH[shape] + 4 / scale;
          ctx.strokeText(text, x, ty);
          ctx.fillText(text, x, ty);
        } else {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const tx = x + node.r * SHAPE_REACH[shape] + 4 / scale;
          ctx.strokeText(text, tx, y);
          ctx.fillText(text, tx, y);
        }
      }
      ctx.restore();
    },
    [focusRoot, highlight, isLight, nodeStyle, palette, selectionId]
  );

  // Hit area covers the farthest-reaching shape (triangle tips), plus a little slack
  const paintPointerArea = useCallback((node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, node.r * 1.3 + 3, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const linkInFocus = useCallback(
    (l: FGLink) => !highlight || (highlight.has(endpointId(l.source)) && highlight.has(endpointId(l.target))),
    [highlight]
  );

  const linkColor = useCallback(
    (l: FGLink) => {
      if (highlight) return linkInFocus(l) ? withAlpha(palette.accent, 0.85) : withAlpha(palette.line, 0.06);
      const src = nodesById.get(endpointId(l.source));
      return src?.isSource ? withAlpha(nodeColor(src), 0.32) : withAlpha(palette.line, 0.35);
    },
    [highlight, linkInFocus, nodeColor, nodesById, palette]
  );

  // ── Interaction ──
  const handleNodeHover = useCallback(
    (node: FGNode | null) => {
      setHoverNodeId(node?.id ?? null);
      if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'grab';
      onHoverSource(node?.isSource ? node.id : null);
    },
    [onHoverSource]
  );

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      if (node.isSource) {
        onSelectEntity(null);
        onSelectSource(selectedSourceId === node.id ? null : node.id);
      } else {
        onSelectSource(null);
        onSelectEntity(selectedEntity?.id === node.id ? null : { id: node.id, name: node.label, type: node.type });
      }
    },
    [onSelectEntity, onSelectSource, selectedEntity, selectedSourceId]
  );

  const clearSelection = useCallback(() => {
    onSelectEntity(null);
    onSelectSource(null);
  }, [onSelectEntity, onSelectSource]);

  const zoomBy = (factor: number) => {
    const fg = fgRef.current;
    if (fg) fg.zoom(fg.zoom() * factor, reducedMotion ? 0 : 220);
  };
  const fit = () => fgRef.current?.zoomToFit(reducedMotion ? 0 : 500, 72);
  const reset = () => {
    clearSelection();
    positionsRef.current.clear();
    fittedRef.current = false;
    fgRef.current?.d3ReheatSimulation();
  };

  // ── Derived copy ──
  const sourceNodeCount = graphData.nodes.filter((n) => n.isSource).length;
  const conceptCount = graphData.nodes.length - sourceNodeCount;

  // By type, one row: each type's shape in its color. By source, color and shape mean different things,
  // so the legend splits them: colors for source kinds, shapes (in neutral ink) for entity types.
  const legend = useMemo(() => {
    const byType = clusterMode === 'type';
    const presentTypes = new Set(graphData.nodes.filter((n) => !n.isSource).map((n) => typeBucket(n.type).label));
    const shapes: Array<{ label: string; shape: NodeShape; hollow: boolean; color: string }> = [
      { label: 'Source', shape: 'square', hollow: false, color: byType ? palette.source : palette.inkSoft },
      ...[...TYPE_PALETTE, OTHER_TYPE]
        .filter((t) => presentTypes.has(t.label))
        .map((t) => ({ label: t.label, shape: t.shape, hollow: Boolean(t.hollow), color: byType ? (isLight ? t.light : t.dark) : palette.inkSoft })),
    ];
    const presentKinds = new Set(graphData.nodes.filter((n) => n.isSource).map((n) => kindOfSource(n.id)));
    const kinds = byType ? [] : KIND_ORDER.filter((k) => presentKinds.has(k)).map((k) => ({ label: KIND_META[k].label, color: kindPaint(k) }));
    return { shapes, kinds };
  }, [clusterMode, graphData, isLight, kindOfSource, kindPaint, palette]);

  const selectedSourceNode = selectedSourceId ? nodesById.get(selectedSourceId) : undefined;
  const selectedSource = selectedSourceId ? sourcesById.get(selectedSourceId) : undefined;
  const entityNode = selectedEntity ? nodesById.get(selectedEntity.id) : undefined;

  let overlay: ReactNode = null;
  if (!isAuthenticated) {
    overlay = <CanvasMessage title="Sign in to build your knowledge map" body="Scout maps the concepts in every source you add, and links the ones they share." />;
  } else if (isLoading) {
    overlay = (
      <div className="flex items-center gap-2 text-[13px] text-[var(--ws-ink-soft)]">
        <Loader2 size={16} className="animate-spin text-[var(--ws-accent)]" /> Loading knowledge map
      </div>
    );
  } else if (isError) {
    overlay = (
      <CanvasMessage
        title="The knowledge map didn't load"
        body="The graph service may be offline. Your sources and chat still work."
        action={{ label: 'Try again', onClick: onRetry }}
      />
    );
  } else if (graphData.nodes.length === 0) {
    overlay = (
      <CanvasMessage
        title="Nothing mapped yet"
        body="Add a source and Scout extracts the concepts it covers. Concepts shared between sources link up here."
        action={{ label: 'Add a source', onClick: onAddSource }}
      />
    );
  }

  return (
    <section aria-label="Knowledge map" className="font-ui ws-dot-grid relative flex h-full min-h-0 flex-col text-[var(--ws-ink)]">
      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex min-w-0 items-start gap-2.5">
          {headerStart}
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              Knowledge map
              {isFetching && !isLoading && <Loader2 size={13} className="animate-spin text-[var(--ws-ink-faint)]" aria-label="Refreshing" />}
            </h2>
            {graphData.nodes.length > 0 && (
              <p className="text-[12.5px] text-[var(--ws-ink-soft)] tabular-nums">
                {conceptCount} concepts from {sourceNodeCount} {sourceNodeCount === 1 ? 'source' : 'sources'}
              </p>
            )}
          </div>
        </div>
        {graphData.nodes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="pointer-events-auto flex h-9 shrink-0 items-center gap-2 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
              >
                {clusterMode === 'source' ? 'Group by source' : 'Group by type'}
                <ChevronDown size={14} className="text-[var(--ws-ink-faint)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-ui">
              <DropdownMenuItem onSelect={() => onClusterModeChange('source')} className="flex-col items-start gap-0 py-2">
                <span className="text-[13px] font-medium">Group by source</span>
                <span className="text-[11.5px] text-[var(--ws-ink-faint)]">Concepts sit beside the source they came from</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onClusterModeChange('type')} className="flex-col items-start gap-0 py-2">
                <span className="text-[13px] font-medium">Group by type</span>
                <span className="text-[11.5px] text-[var(--ws-ink-faint)]">People, technologies and concepts gather together</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative min-h-0 flex-1 cursor-grab">
        {hasCanvas && !overlay && (
          <ForceGraph2D<GNode, GLink>
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeLabel={() => ''}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={paintPointerArea}
            linkColor={linkColor}
            linkWidth={(l) => (highlight && linkInFocus(l) ? 1.6 : 0.8)}
            linkCurvature={0.14}
            linkDirectionalParticles={(l) => (!reducedMotion && highlight && linkInFocus(l) ? 2 : 0)}
            linkDirectionalParticleWidth={2.4}
            linkDirectionalParticleSpeed={0.007}
            linkDirectionalParticleColor={() => palette.accent}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onBackgroundClick={clearSelection}
            onEngineStop={handleEngineStop}
            warmupTicks={reducedMotion ? 160 : 30}
            cooldownTicks={reducedMotion ? 0 : 180}
            d3VelocityDecay={0.32}
            minZoom={0.3}
            maxZoom={6}
          />
        )}
        {overlay && <div className="absolute inset-0 grid place-items-center p-6">{overlay}</div>}
      </div>

      {/* Inspector */}
      {!overlay && (entityNode || selectedSourceNode) && (
        <div className="absolute left-4 top-[72px] z-10 w-[min(300px,calc(100%-2rem))] rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-glass)] p-4 shadow-[var(--ws-shadow)] backdrop-blur-md">
          {entityNode && selectedEntity ? (
            <EntityInspector
              node={entityNode}
              mark={nodeStyle(entityNode)}
              typeLabel={typeBucket(entityNode.type).label === 'Other' ? entityNode.type : typeBucket(entityNode.type).label}
              sources={entityNode.sourceIds.map((id) => sourcesById.get(id)).filter((s): s is Source => Boolean(s))}
              relatedCount={(graph.neighbors.get(entityNode.id)?.size ?? 0) - entityNode.sourceIds.length}
              onSelectSource={(id) => {
                onSelectEntity(null);
                onSelectSource(id);
              }}
              onAsk={() =>
                onAsk(`How do my sources describe "${selectedEntity.name}", and how does it connect to the other concepts they cover?`)
              }
              onClose={() => onSelectEntity(null)}
            />
          ) : selectedSourceNode ? (
            <SourceInspector
              title={selectedSource ? getSourceTitle(selectedSource) : selectedSourceNode.label}
              kind={kindOfSource(selectedSourceNode.id)}
              mark={nodeStyle(selectedSourceNode)}
              conceptCount={graph.entitiesBySource.get(selectedSourceNode.id)?.size ?? 0}
              onAsk={() =>
                onAsk(`Summarize the key ideas in "${selectedSource ? getSourceTitle(selectedSource) : selectedSourceNode.label}" and how they relate to my other sources.`)
              }
              onClose={() => onSelectSource(null)}
            />
          ) : null}
        </div>
      )}

      {/* Controls */}
      {!overlay && (
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)]">
            <CanvasButton label="Zoom in" onClick={() => zoomBy(1.35)}><Plus size={16} /></CanvasButton>
            <CanvasButton label="Zoom out" onClick={() => zoomBy(1 / 1.35)} divided><Minus size={16} /></CanvasButton>
            <CanvasButton label="Fit to view" onClick={fit} divided><Maximize size={15} /></CanvasButton>
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex h-9 items-center gap-1.5 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      )}

      {/* Legend */}
      {!overlay && legend.shapes.length > 0 && (
        <div
          role="group"
          aria-label="Map legend"
          className="absolute bottom-4 right-4 z-10 hidden max-w-[62%] flex-col gap-1.5 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3.5 py-2 sm:flex"
        >
          {legend.kinds.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <span className="text-[11.5px] text-[var(--ws-ink-faint)]">Color is the source type</span>
              {legend.kinds.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {legend.kinds.length > 0 && <span className="text-[11.5px] text-[var(--ws-ink-faint)]">Shape is the entity type</span>}
            {legend.shapes.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]">
                <ShapeSwatch shape={item.shape} color={item.color} hollow={item.hollow} />
                {item.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]" title="Concepts mentioned by more than one source">
              <span className="h-2.5 w-2.5 rounded-full border border-[var(--ws-ink-soft)] ring-1 ring-[var(--ws-ink-faint)] ring-offset-1 ring-offset-[var(--ws-dock)]" />
              Shared
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function CanvasButton({ label, onClick, divided, children }: { label: string; onClick: () => void; divided?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-9 w-10 place-items-center text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer',
        divided && 'border-l border-[var(--ws-line)]'
      )}
    >
      {children}
    </button>
  );
}

function CanvasMessage({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="max-w-sm text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 h-9 rounded-[12px] bg-[var(--ws-accent)] px-4 text-[13px] font-semibold text-white hover:brightness-110 cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

type NodeMark = { shape: NodeShape; color: string; hollow: boolean };

function InspectorHeader({ chip, mark, title, onClose }: { chip: string; mark: NodeMark; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ws-ink-soft)]">
          <ShapeSwatch shape={mark.shape} color={mark.color} hollow={mark.hollow} />
          {chip}
        </span>
        <h3 className="mt-0.5 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{title}</h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Clear selection"
        className="-mr-1.5 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function AskButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] bg-[var(--ws-accent)] text-[12.5px] font-semibold text-white hover:brightness-110 cursor-pointer"
    >
      <MessageSquare size={13} /> {label}
    </button>
  );
}

function EntityInspector({
  node,
  mark,
  typeLabel,
  sources,
  relatedCount,
  onSelectSource,
  onAsk,
  onClose,
}: {
  node: GNode;
  mark: NodeMark;
  typeLabel: string;
  sources: Source[];
  relatedCount: number;
  onSelectSource: (id: string) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <InspectorHeader chip={typeLabel} mark={mark} title={node.label} onClose={onClose} />
      <p className="mt-2 text-[12.5px] text-[var(--ws-ink-soft)]">
        Mentioned in {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        {relatedCount > 0 && `, linked to ${relatedCount} other ${relatedCount === 1 ? 'concept' : 'concepts'}`}
      </p>
      {sources.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {sources.slice(0, 4).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectSource(s.id)}
                className="w-full truncate rounded-[6px] px-1.5 py-1 text-left text-[12.5px] font-medium text-[var(--ws-ink)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
              >
                {getSourceTitle(s)}
              </button>
            </li>
          ))}
          {sources.length > 4 && <li className="px-1.5 text-[12px] text-[var(--ws-ink-faint)]">and {sources.length - 4} more in the sources list</li>}
        </ul>
      )}
      <AskButton label="Ask Copilot about this" onClick={onAsk} />
    </>
  );
}

function SourceInspector({
  title,
  kind,
  mark,
  conceptCount,
  onAsk,
  onClose,
}: {
  title: string;
  kind: SourceKind;
  mark: NodeMark;
  conceptCount: number;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <InspectorHeader chip={KIND_META[kind].label} mark={mark} title={title} onClose={onClose} />
      <p className="mt-2 text-[12.5px] text-[var(--ws-ink-soft)]">
        {conceptCount > 0 ? `${conceptCount} concepts mapped from this source` : 'No concepts were extracted from this source yet'}
      </p>
      <AskButton label="Summarize with Copilot" onClick={onAsk} />
    </>
  );
}
