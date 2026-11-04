import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ListTree, Loader2, Maximize, MessageSquare, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { Source } from '@/api/sources';
import { useTheme } from '@/features/theme';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { KIND_META, getSourceKind, getSourceTitle, type SourceKind } from '../sourceMeta';
import { useMediaQuery, type WorkspaceGraph, type WorkspaceNode } from '../useWorkspaceData';
import type { DropResult } from './addSourceOptions';
import {
  ALL_RELATIONS,
  buildView,
  countRelations,
  groupEntities,
  isConceptRelation,
  prettyRelation,
  relationColor,
  scopeGraph,
  type MapScope,
  type NodeMark,
  type NodeShape,
  type ViewLink,
} from './graphView';
import EntityNavigator from './EntityNavigator';
import { GROUP_ORDER, OTHER_TYPE, TYPE_PALETTE, groupOf, typeBucket } from './entityTypes';
import type { GraphSceneHandle, SceneNode } from './GraphScene3D';
import RelationshipChips from './RelationshipChips';
import ShapeSwatch from './ShapeSwatch';
import type { EntityFocus } from './SourcesDock';

// three.js is heavy; it loads with the map, not with the app
const GraphScene3D = lazy(() => import('./GraphScene3D'));

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
  /** What the map is about: the selected source, else the open session. Without one the map asks for one. */
  scope: MapScope | null;
  onOpenSources: () => void;
  onOpenSessions: () => void;
  /** Set while a source narrows an open session's map: widens it back to the session. */
  onBackToSession?: () => void;
  /** The relationship chip picked: '*' or one relation type. */
  relationFilter: string;
  onRelationFilterChange: (relationship: string) => void;
  /** Re-extracts typed, described relations from every source. */
  onRebuildRelations?: () => void;
  isRebuildingRelations?: boolean;
  rebuildError?: string | null;
  /** Rendered at the start of the header, e.g. a toggle for the sources drawer on small screens. */
  headerStart?: ReactNode;
  /** Shown in place of the map while it has nothing on it; defaults to a short note with an add-source button. */
  emptyState?: ReactNode;
  /** Where the legend goes, e.g. a slot above the copilot; without one it sits in the safe area's bottom right corner. */
  legendContainer?: HTMLElement | null;
  /** Orb only: where the scope's title and the relationship chips go, beside the orb. */
  relationsContainer?: HTMLElement | null;
  /** Makes the map a drop target for sources: links, text files or selected text. */
  onDropSources?: (data: DataTransfer) => DropResult;
  /** Seconds until sources can be added again, while adding them is rate limited; 0 otherwise. */
  dropPausedFor?: number;
  /** The heading over the empty map while it takes drops. */
  dropHeading?: ReactNode;
  /**
   * Distance in px from each canvas edge to the part that windows floating over the map leave clear. The 3D map
   * fills it, and the header, controls, inspector and empty state stay inside it.
   */
  safeArea?: SafeArea;
  /**
   * 'orb' is the map in the middle of the session flow: just the 3D scene in a circle, still a drop target. The
   * header and chips go to relationsContainer and the legend to legendContainer; no inspector or controls, and
   * picking a concept still hands it to the copilot.
   */
  variant?: 'full' | 'orb';
  /** Orb only: where the picked concept's card goes, e.g. above the copilot. */
  inspectorContainer?: HTMLElement | null;
  /** Orb only: shown in place of the scene while there's nothing to map. */
  orbEmpty?: ReactNode;
  /** Orb only: each new value fits the scene to view. */
  fitSignal?: number;
  /** How many nodes keep their name at any zoom; the rest are named as the camera nears them. */
  labelBudget?: number;
}

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_SAFE_AREA: SafeArea = { top: 16, right: 16, bottom: 16, left: 16 };

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
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
  scope,
  onOpenSources,
  onOpenSessions,
  onBackToSession,
  relationFilter,
  onRelationFilterChange,
  onRebuildRelations,
  isRebuildingRelations = false,
  rebuildError = null,
  headerStart,
  emptyState,
  safeArea = DEFAULT_SAFE_AREA,
  legendContainer = null,
  relationsContainer = null,
  inspectorContainer = null,
  onDropSources,
  dropPausedFor = 0,
  dropHeading = 'Drop your source here',
  variant = 'full',
  orbEmpty,
  fitSignal,
  labelBudget = variant === 'orb' ? 10 : 36,
}: GraphCanvasProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [webgl] = useState(hasWebGL);

  const palette = useMemo(
    () =>
      isLight
        ? { ink: '#0f172a', inkSoft: '#475569', line: '#94a3b8', accent: '#0d9488', source: '#0f172a', labelBg: 'rgba(244, 246, 249, 0.88)' }
        : { ink: '#f4f4f5', inkSoft: '#a1a1aa', line: '#52525b', accent: '#14b8a6', source: '#f4f4f5', labelBg: 'rgba(9, 9, 11, 0.8)' },
    [isLight]
  );

  // ── Sizing (debounced so window resizes don't thrash the renderer) ──
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

  // Something being dragged over the map, and a note after a drop that skipped files
  const [dragOver, setDragOver] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  useEffect(() => {
    if (!dropNote) return;
    const t = setTimeout(() => setDropNote(null), 4000);
    return () => clearTimeout(t);
  }, [dropNote]);

  // ── What's on the map: the scope's part of the graph, filtered by the picked relationship ──
  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const scoped = useMemo(() => (scope ? scopeGraph(graph, scope.sourceIds) : { nodes: [], links: [] }), [graph, scope]);
  const relationCounts = useMemo(() => countRelations(scoped.links), [scoped]);
  // A chip whose relation isn't in this scope (or disappeared on refetch) falls back to '*'
  const activeFilter =
    relationFilter === ALL_RELATIONS || relationCounts.types.some((t) => t.relationship === relationFilter) ? relationFilter : ALL_RELATIONS;
  const shown = useMemo(() => buildView(scoped, activeFilter), [scoped, activeFilter]);
  const sceneNodes = useMemo<SceneNode[]>(
    () =>
      shown.nodes.map((n) => ({
        ...n,
        r: n.isSource ? 6 + Math.min(6, Math.sqrt(n.degree) * 1.3) : n.isUser ? 6.5 : 3 + Math.min(4.5, n.degree * 0.6),
      })),
    [shown]
  );
  const shownIds = useMemo(() => new Set(shown.nodes.map((n) => n.id)), [shown]);

  const kindOfSource = useCallback(
    (sourceId: string | undefined): SourceKind => {
      const s = sourceId ? sourcesById.get(sourceId) : undefined;
      return s ? getSourceKind(s) : 'web';
    },
    [sourcesById]
  );

  // Sources are cubes in ink, you are a teal sphere, and concepts take their type's figure and color
  const nodeStyle = useCallback(
    (n: WorkspaceNode): NodeMark => {
      if (n.isUser) return { shape: 'circle', color: palette.accent };
      if (n.isSource) return { shape: 'square', color: palette.source };
      const bucket = typeBucket(n.type);
      return { shape: bucket.shape, color: isLight ? bucket.light : bucket.dark };
    },
    [isLight, palette]
  );

  const linkColor = useCallback((l: ViewLink) => relationColor(l.relationship, isLight), [isLight]);

  // ── Highlight: dock/chat hover beats map hover beats the selected concept. The selected source is the scope
  // itself, so it frames the map rather than highlighting within it. ──
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const focusRoot =
    (hoveredSourceId && shownIds.has(hoveredSourceId) && hoveredSourceId !== selectedSourceId ? hoveredSourceId : null) ??
    hoverNodeId ??
    (selectedEntity && shownIds.has(selectedEntity.id) ? selectedEntity.id : null);

  // Neighbours along what's on screen, so a relationship chip highlights its own edges
  const highlight = useMemo(() => {
    if (!focusRoot) return null;
    const set = new Set<string>([focusRoot]);
    for (const l of shown.links) {
      if (l.source === focusRoot) set.add(l.target);
      else if (l.target === focusRoot) set.add(l.source);
    }
    return set;
  }, [focusRoot, shown]);

  const selectionId = selectedEntity?.id ?? null;

  // ── Interaction ──
  const sceneRef = useRef<GraphSceneHandle | null>(null);

  const handleNodeHover = useCallback(
    (node: SceneNode | null) => {
      setHoverNodeId(node?.id ?? null);
      onHoverSource(node?.isSource ? node.id : null);
    },
    [onHoverSource]
  );

  // Picking a source narrows the map to it; picking a concept opens it in the inspector
  const selectNode = useCallback(
    (node: WorkspaceNode, toggle: boolean) => {
      if (node.isUser) return;
      if (node.isSource) {
        onSelectEntity(null);
        onSelectSource(toggle && selectedSourceId === node.id ? null : node.id);
      } else {
        onSelectEntity(toggle && selectedEntity?.id === node.id ? null : { id: node.id, name: node.label, type: node.type });
      }
    },
    [onSelectEntity, onSelectSource, selectedEntity, selectedSourceId]
  );

  const handleNodeClick = useCallback((node: SceneNode) => selectNode(node, true), [selectNode]);

  // ── Navigation: the navigator lights what it points at, and the card's ‹ › step through concepts in its order.
  // Sources are left out of stepping, since picking one narrows the map. ──
  const selectFromList = useCallback((node: WorkspaceNode) => selectNode(node, false), [selectNode]);
  const stepOrder = useMemo(
    () => groupEntities(shown.nodes.filter((n) => !n.isSource), '', null, groupOf, GROUP_ORDER).flatMap((g) => g.nodes),
    [shown]
  );
  const stepIndex = selectedEntity ? stepOrder.findIndex((n) => n.id === selectedEntity.id) : -1;
  const step = useCallback(
    (dir: 1 | -1) => {
      if (stepOrder.length === 0) return;
      const next = stepIndex < 0 ? (dir > 0 ? 0 : stepOrder.length - 1) : (stepIndex + dir + stepOrder.length) % stepOrder.length;
      selectNode(stepOrder[next]!, false);
    },
    [selectNode, stepIndex, stepOrder]
  );
  const [entitiesOpen, setEntitiesOpen] = useState(false);

  useEffect(() => {
    if (fitSignal) sceneRef.current?.fit();
  }, [fitSignal]);

  // Clicking empty space lets go of the concept, never of the scope
  const clearEntity = useCallback(() => onSelectEntity(null), [onSelectEntity]);

  const reset = () => {
    clearEntity();
    sceneRef.current?.relayout();
  };

  // Each type's shape in its color
  const legend = useMemo(() => {
    const presentTypes = new Set(shown.nodes.filter((n) => !n.isSource && !n.isUser).map((n) => typeBucket(n.type).label));
    const hasSources = shown.nodes.some((n) => n.isSource);
    const shapes: Array<{ label: string; shape: NodeShape; color: string }> = [
      ...(hasSources ? [{ label: 'Source', shape: 'square' as const, color: palette.source }] : []),
      ...[...TYPE_PALETTE, OTHER_TYPE]
        .filter((t) => presentTypes.has(t.label))
        .map((t) => ({ label: t.label, shape: t.shape, color: isLight ? t.light : t.dark })),
    ];
    return { shapes };
  }, [shown, isLight, palette]);

  const selectedSourceNode = selectedSourceId ? nodesById.get(selectedSourceId) : undefined;
  const selectedSource = selectedSourceId ? sourcesById.get(selectedSourceId) : undefined;
  const entityNode = selectedEntity ? nodesById.get(selectedEntity.id) : undefined;

  // The selected concept's relations, both ways, for the inspector
  const entityRelations = useMemo(() => {
    if (!entityNode) return [];
    return graph.links
      .filter((l) => isConceptRelation(l.relationship) && (l.source === entityNode.id || l.target === entityNode.id))
      .map((l) => {
        const outgoing = l.source === entityNode.id;
        const other = nodesById.get(outgoing ? l.target : l.source);
        return other ? { outgoing, relationship: l.relationship, description: l.description, other } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [entityNode, graph, nodesById]);

  let overlay: ReactNode = null;
  if (!isAuthenticated) {
    overlay = <CanvasMessage title="Sign in to build your knowledge map" body="Scout maps the concepts in every source you add, and links the ones they share." />;
  } else if (isLoading) {
    overlay = <LoadingNote label="Loading knowledge map" />;
  } else if (isError) {
    overlay = (
      <CanvasMessage
        title="The knowledge map didn't load"
        body="The graph service may be offline. Your sources and chat still work."
        action={{ label: 'Try again', onClick: onRetry }}
      />
    );
  } else if (graph.nodes.every((n) => n.isUser)) {
    overlay = emptyState ?? (
      <CanvasMessage
        title="Nothing mapped yet"
        body="Add a source and Scout extracts the concepts it covers, and how they relate."
        action={{ label: 'Add a source', onClick: onAddSource }}
      />
    );
  } else if (!scope) {
    overlay = (
      <CanvasMessage
        title="Pick a source or open a session"
        body="The map shows what one source, or one research session, covers: its concepts and how they relate."
        action={{ label: 'Browse sources', onClick: onOpenSources }}
        secondary={{ label: 'Open sessions', onClick: onOpenSessions }}
      />
    );
  } else if (!webgl) {
    overlay = (
      <CanvasMessage
        title="This browser can't draw the 3D map"
        body="The knowledge map needs WebGL, which is turned off or unsupported here. Your sources and chat still work."
      />
    );
  }

  // The scope has nothing on the map yet: an empty session, or sources still being read
  const rebuildAction = onRebuildRelations
    ? { label: isRebuildingRelations ? 'Rebuilding…' : 'Rebuild map', onClick: onRebuildRelations, disabled: isRebuildingRelations }
    : undefined;
  let viewEmpty: ReactNode = null;
  if (!overlay && scope && shown.nodes.length === 0) {
    if (activeFilter !== ALL_RELATIONS) {
      viewEmpty = <CanvasMessage title="Nothing to show here" body="Pick another relationship." />;
    } else if (scope.kind === 'session' && scope.sourceIds.size === 0) {
      viewEmpty = (
        <CanvasMessage
          title="No sources in this session yet"
          body="Add a source to this session and Scout maps its concepts here."
          action={{ label: 'Add a source', onClick: onAddSource }}
        />
      );
    } else {
      viewEmpty = (
        <CanvasMessage
          title={scope.kind === 'source' ? "This source isn't mapped yet" : "This session's sources aren't mapped yet"}
          body="Scout may still be reading them, or they were added before concepts were extracted. Rebuild to re-read them."
          action={rebuildAction}
        />
      );
    }
  }

  // Shape and color are the entity type; it sits in the safe area's corner, or in legendContainer
  const renderLegend = (className: string) => (
    <div
      role="group"
      aria-label="Map legend"
      className={cn('pointer-events-auto hidden flex-col gap-1.5 rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3.5 py-2 sm:flex', className)}
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        {legend.shapes.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]">
            <ShapeSwatch shape={item.shape} color={item.color} />
            {item.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--ws-ink-soft)]" title="Concepts mentioned by more than one source">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--ws-ink-soft)]" />
          Shared
        </span>
      </div>
    </div>
  );

  // What the map is about, and the way back out of a source to its session
  const renderScopeTitle = (className?: string) => (
    <div className={cn('min-w-0', className)}>
      <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
        {scope && !overlay ? (
          <span className="truncate" title={scope.title}>{scope.title}</span>
        ) : (
          'Knowledge map'
        )}
        {isFetching && !isLoading && <Loader2 size={13} className="shrink-0 animate-spin text-[var(--ws-ink-faint)]" aria-label="Refreshing" />}
      </h2>
    </div>
  );
  const backButton = !overlay && scope?.kind === 'source' && (
    <button
      type="button"
      onClick={onBackToSession ?? (() => onSelectSource(null))}
      className="ui-press pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
    >
      {onBackToSession ? (
        <>
          <ArrowLeft size={14} /> Back to session
        </>
      ) : (
        <>
          <X size={14} /> Close
        </>
      )}
    </button>
  );
  // A filter within what the scope covers
  const renderRelationChips = (className: string) =>
    !overlay && scope && scoped.links.length > 0 && (
      <RelationshipChips
        className={className}
        counts={relationCounts}
        value={activeFilter}
        onChange={onRelationFilterChange}
        isLight={isLight}
        onRebuild={onRebuildRelations}
        isRebuilding={isRebuildingRelations}
        rebuildError={rebuildError}
      />
    );

  // ── The map takes dropped sources; a heading says so on the empty map, and answers while something is dragged ──
  const canDrop = isAuthenticated && Boolean(onDropSources);
  // While something is dragged over, or just after a drop that skipped files, this replaces the heading
  const dropStatus = dragOver
    ? dropPausedFor > 0
      ? `Adding sources is paused for ${dropPausedFor}s`
      : 'Release to add it'
    : dropNote;
  const showDropHeading = canDrop && (dropStatus !== null || (overlay !== null && !isLoading && !isError));
  const dropHandlers = canDrop
    ? {
        onDragEnter: (e: DragEvent<HTMLDivElement>) => {
          if (!carriesSource(e.dataTransfer)) return;
          e.preventDefault();
          setDragOver(true);
        },
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          if (!carriesSource(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = dropPausedFor > 0 ? 'none' : 'copy';
          if (!dragOver) setDragOver(true);
        },
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragOver(false);
          if (dropPausedFor > 0 || !onDropSources) return;
          const { added, skipped } = onDropSources(e.dataTransfer);
          if (skipped > 0) {
            setDropNote(
              added > 0
                ? `Added ${added}, skipped ${skipped} that can't be read as text`
                : 'Drop a link or a text file. Add PDFs by link'
            );
          }
        },
      }
    : {};

  const hasScene = !overlay && size.width > 0 && size.height > 0 && sceneNodes.length > 0;
  const entityCount = shown.nodes.filter((n) => !n.isUser).length;

  // The picked concept's card: over the full map, or in inspectorContainer beside the orb
  const entityInspector =
    !overlay && entityNode && selectedEntity ? (
      <EntityInspector
        node={entityNode}
        mark={nodeStyle(entityNode)}
        typeLabel={typeBucket(entityNode.type).label === 'Other' ? entityNode.type : typeBucket(entityNode.type).label}
        sources={entityNode.sourceIds.map((id) => sourcesById.get(id)).filter((s): s is Source => Boolean(s))}
        relations={entityRelations}
        isLight={isLight}
        step={stepIndex >= 0 && stepOrder.length > 1 ? { index: stepIndex, total: stepOrder.length, go: step } : undefined}
        onSelectNode={(n) => selectNode(n, false)}
        onSelectSource={(id) => {
          onSelectEntity(null);
          onSelectSource(id);
        }}
        onAsk={() => onAsk(`How do my sources describe "${selectedEntity.name}", and how does it connect to the other concepts they cover?`)}
        onClose={() => onSelectEntity(null)}
      />
    ) : null;

  const scene = hasScene && (
    <Suspense fallback={<div className="absolute inset-0 grid place-items-center"><LoadingNote label="Loading 3D map" /></div>}>
      <div className="ws-map-canvas absolute inset-0 ui-in-fade">
        <GraphScene3D
          ref={sceneRef}
          width={size.width}
          height={size.height}
          nodes={sceneNodes}
          links={shown.links}
          nodeMark={nodeStyle}
          linkColor={linkColor}
          palette={palette}
          highlight={highlight}
          focusRoot={focusRoot}
          selectionId={selectionId}
          labelBudget={labelBudget}
          reducedMotion={reducedMotion}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onBackgroundClick={clearEntity}
        />
      </div>
    </Suspense>
  );

  if (variant === 'orb') {
    let orbNote: ReactNode = null;
    if (isLoading) orbNote = <LoadingNote label="Loading map" />;
    else if (isError) orbNote = <CanvasMessage title="The map didn't load" body="Sources and chat still work." action={{ label: 'Try again', onClick: onRetry }} />;
    else if (!webgl) orbNote = <p className="max-w-[24ch] text-[13px] text-[var(--ws-ink-soft)]">This browser can't draw the 3D map.</p>;
    else if (overlay || viewEmpty) orbNote = orbEmpty ?? null;
    return (
      <section aria-label="Knowledge map" className="font-ui relative h-full w-full overflow-hidden rounded-full text-[var(--ws-ink)]">
        <div ref={containerRef} className="absolute inset-0" {...dropHandlers}>
          {scene}
          {orbNote && <div className="absolute inset-0 grid place-items-center p-10 text-center">{orbNote}</div>}
          {dragOver && (
            <div
              className="pointer-events-none absolute inset-2 rounded-full border-2 border-dashed border-[var(--ws-accent)] bg-[var(--ws-accent-wash)] opacity-80 animate-in fade-in-0 duration-200"
              aria-hidden
            />
          )}
          {canDrop && <p className="sr-only" aria-live="polite">{dropStatus}</p>}
        </div>
        {relationsContainer &&
          !overlay &&
          scope &&
          createPortal(
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2 px-1">
                {renderScopeTitle('min-w-[140px] flex-1')}
                {backButton}
              </div>
              {renderRelationChips('w-full')}
              {hasScene && entityCount > 0 && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    aria-expanded={entitiesOpen}
                    onClick={() => setEntitiesOpen((o) => !o)}
                    className="ui-press flex h-8 w-fit items-center gap-1.5 rounded-full border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[12.5px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
                  >
                    <ListTree size={13} className="text-[var(--ws-ink-soft)]" />
                    Entities <span className="tabular-nums text-[var(--ws-ink-faint)]">{entityCount}</span>
                    <ChevronDown size={13} className={cn('text-[var(--ws-ink-faint)] transition-transform duration-200', entitiesOpen && 'rotate-180')} />
                  </button>
                  {entitiesOpen && (
                    <EntityNavigator
                      nodes={shown.nodes}
                      markOf={nodeStyle}
                      selectedId={selectionId ?? selectedSourceId}
                      onHover={setHoverNodeId}
                      onSelect={selectFromList}
                      compact
                      className="w-full"
                    />
                  )}
                </div>
              )}
            </div>,
            relationsContainer
          )}
        {legendContainer && legend.shapes.length > 0 && hasScene && createPortal(renderLegend('w-fit max-w-full'), legendContainer)}
        {inspectorContainer &&
          entityInspector &&
          createPortal(
            // Keyed by concept, so stepping to another one arrives like a fresh pick
            <div
              key={entityNode?.id}
              role="region"
              aria-label="Selected concept"
              className="ui-in-up sidebar-scroll min-h-0 overflow-y-auto rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-dock)] p-4 shadow-[var(--ws-shadow)]"
            >
              {entityInspector}
            </div>,
            inspectorContainer
          )}
      </section>
    );
  }

  return (
    <section aria-label="Knowledge map" className="font-ui relative h-full min-h-0 overflow-hidden text-[var(--ws-ink)]">
      {/* The 3D map fills the part of the screen the floating windows leave clear, and fades out at its edges */}
      <div
        ref={containerRef}
        className="ws-map absolute transition-[top,right,bottom,left] duration-300 ease-[var(--ui-ease)] motion-reduce:transition-none"
        style={safeArea}
        {...dropHandlers}
      >
        {scene}
        {showDropHeading && <DropHeading>{dropStatus ?? dropHeading}</DropHeading>}
        {canDrop && <p className="sr-only" aria-live="polite">{dropStatus}</p>}
        {(overlay || viewEmpty) && (
          <div className="@container pointer-events-none absolute inset-0 grid place-items-center px-6 pb-6 pt-24 text-center">
            <div className="pointer-events-auto flex w-full justify-center">{overlay ?? viewEmpty}</div>
          </div>
        )}
        {dragOver && (
          <div
            className="pointer-events-none absolute inset-2 rounded-4xl border-2 border-dashed border-[var(--ws-accent)] bg-[var(--ws-accent-wash)] opacity-70 animate-in fade-in-0 duration-200"
            aria-hidden
          />
        )}
      </div>

      {/* Everything drawn over the map keeps to the safe area, and follows it as windows open and close */}
      <div
        className="pointer-events-none absolute z-10 transition-[top,right,bottom,left] duration-300 ease-[var(--ui-ease)] motion-reduce:transition-none"
        style={safeArea}
      >
        {/* Header: what the map is about, and the way back out of a source to its session */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex min-w-0 items-start gap-2.5">
            {headerStart}
            {renderScopeTitle()}
          </div>
          {backButton}
        </div>

        {renderRelationChips('absolute left-0 top-14 w-[min(340px,100%)]')}

        {/* Inspector */}
        {!overlay && (entityNode || selectedSourceNode) && (
          <div className="pointer-events-auto absolute right-0 top-14 max-h-[calc(100%-8.5rem)] w-[min(320px,100%)] overflow-y-auto rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-glass)] p-4 shadow-[var(--ws-shadow)] backdrop-blur-md">
            {entityInspector ?? (selectedSourceNode ? (
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
            ) : null)}
          </div>
        )}

        {/* Controls */}
        {hasScene && (
          <div className="pointer-events-auto absolute bottom-0 left-0 flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-[var(--ws-line)] bg-[var(--ws-dock)]">
              <CanvasButton label="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.35)}><Plus size={16} /></CanvasButton>
              <CanvasButton label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1 / 1.35)} divided><Minus size={16} /></CanvasButton>
              <CanvasButton label="Fit to view" onClick={() => sceneRef.current?.fit()} divided><Maximize size={15} /></CanvasButton>
            </div>
            <button
              type="button"
              onClick={reset}
              className="ui-press flex h-9 items-center gap-1.5 rounded-full border border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <span className="hidden text-[11.5px] text-[var(--ws-ink-faint)] lg:inline">Drag to orbit · right-drag to pan · scroll to zoom</span>
          </div>
        )}

        {!legendContainer && legend.shapes.length > 0 && hasScene && renderLegend('absolute bottom-0 right-0 max-w-[62%]')}
      </div>
      {legendContainer && legend.shapes.length > 0 && hasScene && createPortal(renderLegend('w-fit max-w-full shadow-[var(--ws-shadow-sm)]'), legendContainer)}
    </section>
  );
}

// Whether a drag carries something the map can take: files, links or text
function carriesSource(data: DataTransfer) {
  return Array.from(data.types).some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain');
}

// The heading at the top of the map while it takes drops, in teal
function DropHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      className="ui-in-up pointer-events-none absolute left-1/2 top-16 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 text-balance text-center text-[clamp(18px,2.4vw,28px)] font-semibold leading-tight tracking-[-0.01em] text-[var(--ws-accent-ink)]"
      style={introDelay(200)}
    >
      {children}
    </h2>
  );
}

function LoadingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--ws-ink-soft)]">
      <Loader2 size={16} className="animate-spin text-[var(--ws-accent)]" /> {label}
    </div>
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
        'ui-press grid h-9 w-10 place-items-center text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer',
        divided && 'border-l border-[var(--ws-line)]'
      )}
    >
      {children}
    </button>
  );
}

type MessageAction = { label: string; onClick: () => void; disabled?: boolean };

function CanvasMessage({ title, body, action, secondary }: { title: string; body: string; action?: MessageAction; secondary?: MessageAction }) {
  return (
    <div className="max-w-sm text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">{body}</p>
      {(action || secondary) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="ui-press h-9 rounded-full bg-[var(--ws-accent)] px-4 text-[13px] font-semibold text-white hover:brightness-110 cursor-pointer disabled:cursor-default disabled:opacity-60"
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="ui-press h-9 rounded-full border border-[var(--ws-line)] bg-[var(--ws-dock)] px-4 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Where the selected concept sits in the navigator's order, and a way to move along it */
interface InspectorStep {
  index: number;
  total: number;
  go: (dir: 1 | -1) => void;
}

const ICON_BUTTON =
  'ui-press grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer';

function InspectorHeader({ chip, mark, title, step, onClose }: { chip: string; mark: NodeMark; title: string; step?: InspectorStep; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ws-ink-soft)]">
          <ShapeSwatch shape={mark.shape} color={mark.color} />
          {chip}
        </span>
        <h3 className="mt-0.5 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{title}</h3>
      </div>
      <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
        {step && (
          <>
            <button type="button" onClick={() => step.go(-1)} aria-label="Previous concept" title="Previous concept ( [ )" className={ICON_BUTTON}>
              <ChevronLeft size={15} />
            </button>
            <span className="px-0.5 text-[11px] tabular-nums text-[var(--ws-ink-faint)]" aria-label={`Concept ${step.index + 1} of ${step.total}`}>
              {step.index + 1}/{step.total}
            </span>
            <button type="button" onClick={() => step.go(1)} aria-label="Next concept" title="Next concept ( ] )" className={ICON_BUTTON}>
              <ChevronRight size={15} />
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Clear selection" className={ICON_BUTTON}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function AskButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-press mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--ws-accent)] text-[12.5px] font-semibold text-white hover:brightness-110 cursor-pointer"
    >
      <MessageSquare size={13} /> {label}
    </button>
  );
}

interface EntityRelation {
  outgoing: boolean;
  relationship: string;
  description?: string;
  other: WorkspaceNode;
}

const MAX_LISTED_RELATIONS = 8;

function EntityInspector({
  node,
  mark,
  typeLabel,
  sources,
  relations,
  isLight,
  step,
  onSelectNode,
  onSelectSource,
  onAsk,
  onClose,
}: {
  node: WorkspaceNode;
  mark: NodeMark;
  typeLabel: string;
  sources: Source[];
  relations: EntityRelation[];
  isLight: boolean;
  step?: InspectorStep;
  onSelectNode: (node: WorkspaceNode) => void;
  onSelectSource: (id: string) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <InspectorHeader chip={typeLabel} mark={mark} title={node.label} step={step} onClose={onClose} />
      {node.description && <p className="mt-2 text-[13px] leading-relaxed text-[var(--ws-ink)]">{node.description}</p>}

      {relations.length > 0 && (
        <div className="mt-3">
          <p className="text-[11.5px] font-medium text-[var(--ws-ink-faint)]">Relationships</p>
          <ul className="mt-1 space-y-0.5">
            {relations.slice(0, MAX_LISTED_RELATIONS).map((r) => (
              <li key={`${r.outgoing ? 'out' : 'in'}-${r.relationship}-${r.other.id}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode(r.other)}
                  title={r.description}
                  className="flex w-full items-center gap-1.5 rounded-full px-1.5 py-1 text-left text-[12.5px] hover:bg-[var(--ws-card-hover)] cursor-pointer"
                >
                  {r.outgoing ? (
                    <ArrowRight size={12} className="shrink-0 text-[var(--ws-ink-faint)]" aria-label="to" />
                  ) : (
                    <ArrowLeft size={12} className="shrink-0 text-[var(--ws-ink-faint)]" aria-label="from" />
                  )}
                  <span className="shrink-0 font-semibold" style={{ color: relationColor(r.relationship, isLight) }}>
                    {prettyRelation(r.relationship)}
                  </span>
                  <span className="min-w-0 truncate font-medium text-[var(--ws-ink)]">{r.other.label}</span>
                </button>
              </li>
            ))}
            {relations.length > MAX_LISTED_RELATIONS && (
              <li className="px-1.5 text-[12px] text-[var(--ws-ink-faint)]">and {relations.length - MAX_LISTED_RELATIONS} more on the map</li>
            )}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[12.5px] text-[var(--ws-ink-soft)]">
        Mentioned in {sources.length} {sources.length === 1 ? 'source' : 'sources'}
      </p>
      {sources.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {sources.slice(0, 4).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectSource(s.id)}
                className="w-full truncate rounded-full px-1.5 py-1 text-left text-[12.5px] font-medium text-[var(--ws-ink)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
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
