import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ListTree, Loader2, Maximize, MessageSquare, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { Source } from '@/api/sources';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTheme } from '@/features/theme';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { KIND_META, getSourceKind, getSourceTitle, type SourceKind } from '../sourceMeta';
import { useMediaQuery, type WorkspaceGraph, type WorkspaceNode } from '../useWorkspaceData';
import { linksIn, type DropResult } from './addSourceOptions';
import {
  ALL_RELATIONS,
  SHARED_VIEW,
  buildView,
  countRelations,
  countShared,
  groupEntities,
  isConceptRelation,
  isSharedIn,
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
import CardBoard, { type BoardNode, type CardBoardHandle } from './CardBoard';
import RelationshipChips from './RelationshipChips';
import ShapeSwatch from './ShapeSwatch';
import type { EntityFocus } from './SourcesDock';

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
  /** The chip picked: '*', Shared, or one relation type. */
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
  /** Board only: where the scope's caption and the bar of map controls and relationship chips go, under the board. */
  dockContainer?: HTMLElement | null;
  /** Makes the map a drop target for sources: links, text files or selected text. */
  onDropSources?: (data: DataTransfer) => DropResult;
  /** Ctrl/⌘ V outside a text field, or with the pointer over the map: adds the clipboard's links. */
  onPasteLinks?: (links: string[]) => void;
  /** Seconds until sources can be added again, while adding them is rate limited; 0 otherwise. */
  dropPausedFor?: number;
  /** The heading over the empty map while it takes drops. */
  dropHeading?: ReactNode;
  /**
   * Distance in px from each canvas edge to the part that windows floating over the map leave clear. The map
   * fills it, and the header, controls, inspector and empty state stay inside it.
   */
  safeArea?: SafeArea;
  /**
   * 'board' is the map in the middle of the session flow: just the cards in a box, still a drop target. Its
   * caption, controls and chips go to dockContainer, and the picked concept's card to inspectorContainer.
   */
  variant?: 'full' | 'board';
  /** Board only: where the scope's title, and the way back out of a source, go: the board's header. */
  headerContainer?: HTMLElement | null;
  /** Board only: where the picked concept's card goes. */
  inspectorContainer?: HTMLElement | null;
  /** Board only: shown in place of the cards while there's nothing to map. */
  boardEmpty?: ReactNode;
}

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_SAFE_AREA: SafeArea = { top: 16, right: 16, bottom: 16, left: 16 };

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
  dockContainer = null,
  headerContainer = null,
  inspectorContainer = null,
  onDropSources,
  onPasteLinks,
  dropPausedFor = 0,
  dropHeading = 'Drop your source here',
  variant = 'full',
  boardEmpty,
}: GraphCanvasProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const palette = useMemo(
    () => (isLight ? { accent: '#22b3bd', source: '#0f172a' } : { accent: '#2cc8d2', source: '#f4f4f5' }),
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

  // Something being dragged over the map, a note after a drop or paste, and the ring that answers a paste
  const canDrop = isAuthenticated && Boolean(onDropSources);
  const [dragOver, setDragOver] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  useEffect(() => {
    if (!dropNote) return;
    const t = setTimeout(() => setDropNote(null), 4000);
    return () => clearTimeout(t);
  }, [dropNote]);
  useEffect(() => {
    if (!pasted) return;
    const t = setTimeout(() => setPasted(false), 700);
    return () => clearTimeout(t);
  }, [pasted]);

  useEffect(() => {
    if (!canDrop || !onPasteLinks) return;
    const onPaste = (e: ClipboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      // A field keeps its own paste, unless the pointer is on the map: that's where the link is being aimed
      const typing = isTextField(e.target);
      if (typing && !containerRef.current?.matches(':hover')) return;
      const links = linksIn(e.clipboardData?.getData('text/plain') ?? '');
      if (links.length === 0) {
        if (!typing) setDropNote('Paste a link to add a source');
        return;
      }
      e.preventDefault();
      if (dropPausedFor > 0) {
        setDropNote(`Adding sources is paused for ${dropPausedFor}s`);
        return;
      }
      onPasteLinks(links);
      setPasted(true);
      setDropNote(links.length === 1 ? 'Adding your link' : `Adding ${links.length} links`);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canDrop, dropPausedFor, onPasteLinks]);

  // ── What's on the map: the scope's part of the graph, filtered by the picked relationship ──
  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const scoped = useMemo(() => (scope ? scopeGraph(graph, scope.sourceIds) : { nodes: [], links: [] }), [graph, scope]);
  const relationCounts = useMemo(() => countRelations(scoped.links), [scoped]);
  const scopeSourceIds = scope?.sourceIds;
  const sharedCount = useMemo(() => (scopeSourceIds ? countShared(scoped.nodes, scopeSourceIds) : 0), [scoped, scopeSourceIds]);
  // A chip that has nothing to show in this scope (or lost it on refetch) falls back to '*'
  const chipAvailable =
    relationFilter === ALL_RELATIONS ||
    (relationFilter === SHARED_VIEW ? sharedCount > 0 : relationCounts.types.some((t) => t.relationship === relationFilter));
  const activeFilter = chipAvailable ? relationFilter : ALL_RELATIONS;
  const shown = useMemo(() => buildView(scoped, activeFilter, scopeSourceIds), [scoped, activeFilter, scopeSourceIds]);
  // Sources are listed beside the board, with their concept counts, so the board holds only what they cover. Their
  // mentions go with them; hovering a source still lights its concepts through `highlight`.
  const boardNodes = useMemo<BoardNode[]>(
    () =>
      shown.nodes
        .filter((n) => !n.isSource)
        .map((n) => ({ ...n, shared: scopeSourceIds ? isSharedIn(n, scopeSourceIds) : false })),
    [shown, scopeSourceIds]
  );
  const boardLinks = useMemo(() => {
    const onBoard = new Set(boardNodes.map((n) => n.id));
    return shown.links.filter((l) => onBoard.has(l.source) && onBoard.has(l.target));
  }, [boardNodes, shown]);
  const shownIds = useMemo(() => new Set(shown.nodes.map((n) => n.id)), [shown]);
  // Another scope or relationship is another board, fitted afresh
  const viewKey = `${scope?.kind ?? ''}:${scope ? [...scope.sourceIds].sort().join(',') : ''}:${activeFilter}`;

  const kindOfSource = useCallback(
    (sourceId: string | undefined): SourceKind => {
      const s = sourceId ? sourcesById.get(sourceId) : undefined;
      return s ? getSourceKind(s) : 'web';
    },
    [sourcesById]
  );

  // Sources are squares in ink, you are a teal circle, and concepts take their type's figure and color
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
  const sceneRef = useRef<CardBoardHandle | null>(null);

  const handleNodeHover = useCallback(
    (node: BoardNode | null) => {
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

  const handleNodeClick = useCallback((node: BoardNode) => selectNode(node, true), [selectNode]);

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
  // The list unmounts when it closes, so its last hovered row has to let go of the map here
  const toggleEntities = (open: boolean) => {
    setEntitiesOpen(open);
    if (!open) setHoverNodeId(null);
  };

  // Clicking empty space lets go of the concept, never of the scope
  const clearEntity = useCallback(() => onSelectEntity(null), [onSelectEntity]);

  const reset = () => {
    clearEntity();
    sceneRef.current?.fit();
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
  }

  // The scope has nothing on the map yet: an empty session, or sources still being read
  const rebuildAction = onRebuildRelations
    ? { label: isRebuildingRelations ? 'Rebuilding…' : 'Rebuild map', onClick: onRebuildRelations, disabled: isRebuildingRelations }
    : undefined;
  let viewEmpty: ReactNode = null;
  if (!overlay && scope && boardNodes.length === 0) {
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
      const unmapped = {
        source: "This source isn't mapped yet",
        compare: "These sources aren't mapped yet",
        session: "This session's sources aren't mapped yet",
      };
      viewEmpty = (
        <CanvasMessage
          title={unmapped[scope.kind]}
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
      className={cn('pointer-events-auto hidden flex-col gap-1.5 rounded-4xl border border-[var(--ws-line)] glass px-3.5 py-2 sm:flex', className)}
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
  const renderBackButton = (className: string) =>
    !overlay && scope && scope.kind !== 'session' && (
      <button
        type="button"
        onClick={onBackToSession ?? (() => onSelectSource(null))}
        className={cn(
          'ui-press pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--ws-line)] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer glass',
          className
        )}
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
  const renderRelationChips = (className: string, leading?: ReactNode) =>
    !overlay && scope && scoped.links.length > 0 && (
      <RelationshipChips
        className={className}
        counts={relationCounts}
        sharedCount={sharedCount}
        leading={leading}
        value={activeFilter}
        onChange={onRelationFilterChange}
        isLight={isLight}
        onRebuild={onRebuildRelations}
        isRebuilding={isRebuildingRelations}
        rebuildError={rebuildError}
      />
    );

  // ── The map takes dropped sources; a heading says so on the empty map, and answers while something is dragged ──
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

  const hasScene = !overlay && size.width > 0 && size.height > 0 && boardNodes.length > 0;
  const typeLabel = useCallback(
    (n: WorkspaceNode) => {
      if (n.isUser) return 'You';
      if (n.isSource) return KIND_META[kindOfSource(n.id)].label;
      const label = typeBucket(n.type).label;
      return label === 'Other' ? n.type : label;
    },
    [kindOfSource]
  );
  const entityCount = shown.nodes.filter((n) => !n.isUser).length;

  // The picked concept's card: over the full map, or in inspectorContainer, the copilot's message box
  const entityInspector =
    !overlay && entityNode && selectedEntity ? (
      <EntityInspector
        node={entityNode}
        mark={nodeStyle(entityNode)}
        typeLabel={typeLabel(entityNode)}
        sources={entityNode.sourceIds.map((id) => sourcesById.get(id)).filter((s): s is Source => Boolean(s))}
        relations={entityRelations}
        isLight={isLight}
        step={stepIndex >= 0 && stepOrder.length > 1 ? { index: stepIndex, total: stepOrder.length, go: step } : undefined}
        onSelectNode={(n) => selectNode(n, false)}
        onSelectSource={(id) => {
          onSelectEntity(null);
          onSelectSource(id);
        }}
        onClose={() => onSelectEntity(null)}
      />
    ) : null;

  const scene = hasScene && (
    <CardBoard
      ref={sceneRef}
      width={size.width}
      height={size.height}
      nodes={boardNodes}
      links={boardLinks}
      nodeMark={nodeStyle}
      typeLabel={typeLabel}
      linkColor={linkColor}
      highlight={highlight}
      focusRoot={focusRoot}
      selectionId={selectionId}
      viewKey={viewKey}
      reducedMotion={reducedMotion}
      onNodeHover={handleNodeHover}
      onNodeClick={handleNodeClick}
      onBackgroundClick={clearEntity}
    />
  );

  if (variant === 'board') {
    let boardNote: ReactNode = null;
    if (isLoading) boardNote = <LoadingNote label="Loading map" />;
    else if (isError) boardNote = <CanvasMessage title="The map didn't load" body="Sources and chat still work." action={{ label: 'Try again', onClick: onRetry }} />;
    else if (overlay || viewEmpty) boardNote = boardEmpty ?? null;
    // Fit and the entity list lead the bar of chips; the list's type pills, each with its figure, double as the legend
    const mapControls = hasScene && (
      <>
        <button
          type="button"
          onClick={() => sceneRef.current?.fit()}
          aria-label="Fit to view"
          title="Fit to view"
          className="ui-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
        >
          <Maximize size={14} />
        </button>
        {entityCount > 0 && (
          <Popover open={entitiesOpen} onOpenChange={toggleEntities}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Entities, ${entityCount}`}
                title="Entities on the map"
                className="ui-press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[var(--ws-ink)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
              >
                <ListTree size={13} className="text-[var(--ws-ink-soft)]" />
                {/* The column is at its narrowest just above the stacked layout: the chips need that room more */}
                <span className="hidden xl:inline">Entities</span>
                <span className="tabular-nums text-[var(--ws-ink-faint)]">{entityCount}</span>
                <ChevronDown size={13} className={cn('hidden text-[var(--ws-ink-faint)] transition-transform duration-200 xl:block', !entitiesOpen && 'rotate-180')} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={12} className="font-ui flex h-[min(440px,60vh)] w-80 flex-col p-3 text-[var(--ws-ink)]">
              <EntityNavigator
                nodes={shown.nodes}
                markOf={nodeStyle}
                selectedId={selectionId ?? selectedSourceId}
                onHover={setHoverNodeId}
                onSelect={(n) => {
                  selectFromList(n);
                  toggleEntities(false);
                }}
                bare
              />
            </PopoverContent>
          </Popover>
        )}
        <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[var(--ws-line)] lg:block" aria-hidden />
      </>
    );
    return (
      <section aria-label="Knowledge map" className="font-ui relative h-full w-full overflow-hidden text-[var(--ws-ink)]">
        <div ref={containerRef} className="absolute inset-0" {...dropHandlers}>
          {scene}
          {boardNote && <div className="absolute inset-0 grid place-items-center p-10 text-center">{boardNote}</div>}
          {(dragOver || pasted) && (
            <div
              className="pointer-events-none absolute inset-2 z-10 rounded-[24px] border-2 border-dashed border-[var(--ws-accent)] bg-[var(--ws-accent-wash)] opacity-80 animate-in fade-in-0 duration-200"
              aria-hidden
            />
          )}
          {dropNote && (
            <div className="pointer-events-none absolute inset-x-[12%] bottom-[10%] z-10 flex justify-center" aria-hidden>
              <p className="ui-in-up rounded-full border border-[var(--ws-line)] glass px-3 py-1.5 text-center text-[12.5px] leading-snug text-[var(--ws-ink)]">
                {dropNote}
              </p>
            </div>
          )}
          {canDrop && <p className="sr-only" aria-live="polite">{dropStatus}</p>}
        </div>
        {/* What the map is about in the board's header, and its controls along the bottom edge */}
        {headerContainer &&
          !overlay &&
          scope &&
          createPortal(
            <div className="flex h-10 min-w-0 items-center gap-2 px-1">
              <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight" title={scope.title}>
                {scope.title}
              </h2>
              {isFetching && !isLoading && <Loader2 size={13} className="shrink-0 animate-spin text-[var(--ws-ink-faint)]" aria-label="Refreshing" />}
              {entityCount > 0 && (
                <span className="shrink-0 text-[12px] tabular-nums text-[var(--ws-ink-faint)]">
                  {entityCount} {entityCount === 1 ? 'concept' : 'concepts'}
                </span>
              )}
              {renderBackButton('ml-auto h-8 px-3 text-[12.5px]')}
            </div>,
            headerContainer
          )}
        {dockContainer && !overlay && scope && createPortal(renderRelationChips('w-full', mapControls), dockContainer)}
        {inspectorContainer &&
          entityInspector &&
          createPortal(
            // Keyed by concept, so stepping to another one arrives like a fresh pick
            <div
              key={entityNode?.id}
              role="region"
              aria-label="Selected concept"
              // Grows with its text, but leaves the conversation in view however long that gets
              className="ui-in-up sidebar-scroll @container max-h-[40vh] overflow-y-auto overflow-x-hidden"
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
      {/* The map fills the part of the screen the floating windows leave clear */}
      <div
        ref={containerRef}
        className="absolute overflow-hidden rounded-4xl transition-[top,right,bottom,left] duration-300 ease-[var(--ui-ease)] motion-reduce:transition-none"
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
          {renderBackButton('h-9 px-3 text-[13px]')}
        </div>

        {renderRelationChips('absolute left-0 top-14 w-[min(340px,100%)]')}

        {/* Inspector */}
        {!overlay && (entityNode || selectedSourceNode) && (
          <div className="pointer-events-auto absolute right-0 top-14 max-h-[calc(100%-8.5rem)] w-[min(320px,100%)] overflow-y-auto rounded-4xl border border-[var(--ws-line)] glass p-4">
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
            <div className="flex overflow-hidden rounded-full border border-[var(--ws-line)] glass">
              <CanvasButton label="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.35)}><Plus size={16} /></CanvasButton>
              <CanvasButton label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1 / 1.35)} divided><Minus size={16} /></CanvasButton>
              <CanvasButton label="Fit to view" onClick={() => sceneRef.current?.fit()} divided><Maximize size={15} /></CanvasButton>
            </div>
            <button
              type="button"
              onClick={reset}
              className="ui-press flex h-9 items-center gap-1.5 rounded-full border border-[var(--ws-line)] glass px-3 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <span className="hidden text-[11.5px] text-[var(--ws-ink-faint)] lg:inline">Drag to pan · scroll to zoom</span>
          </div>
        )}

        {legend.shapes.length > 0 && hasScene && renderLegend('absolute bottom-0 right-0 max-w-[62%]')}
      </div>
    </section>
  );
}

// Whether a drag carries something the map can take: files, links or text
function isTextField(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

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
              className="ui-press h-9 rounded-full glass-accent bg-[var(--ws-accent)] px-4 text-[13px] font-semibold text-[var(--ws-on-accent)] hover:brightness-110 cursor-pointer disabled:cursor-default disabled:opacity-60"
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="ui-press h-9 rounded-full border border-[var(--ws-line)] glass px-4 text-[13px] font-medium text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)] cursor-pointer"
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

function InspectorControls({ step, className, onClose }: { step?: InspectorStep; className?: string; onClose: () => void }) {
  return (
    <div className={cn('-mr-1.5 flex shrink-0 items-center', className)}>
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
  );
}

function InspectorHeader({ chip, mark, title, onClose }: { chip: string; mark: NodeMark; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ws-ink-soft)]">
          <ShapeSwatch shape={mark.shape} color={mark.color} />
          {chip}
        </span>
        <h3 className="mt-0.5 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{title}</h3>
      </div>
      <InspectorControls className="-mt-1" onClose={onClose} />
    </div>
  );
}

function AskButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-press mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-full glass-accent bg-[var(--ws-accent)] text-[12.5px] font-semibold text-[var(--ws-on-accent)] hover:brightness-110 cursor-pointer"
    >
      <MessageSquare size={13} /> {label}
    </button>
  );
}

/** What didn't fit on the concept card's one line; the full list is in its tooltip, and lit on the map. */
function MoreCount({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="shrink-0 tabular-nums text-[var(--ws-ink-faint)]" title={names.join(', ')}>
      +{names.length}
    </span>
  );
}

interface EntityRelation {
  outgoing: boolean;
  relationship: string;
  description?: string;
  other: WorkspaceNode;
}

/** The picked concept in three lines: its name and controls, what it is, and where it comes from and connects to. */
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
  onClose: () => void;
}) {
  const [firstSource, ...otherSources] = sources;
  const [firstRelation, ...otherRelations] = relations;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-start gap-2 text-[15px] font-semibold leading-snug">
          <span className="mt-[3px] shrink-0" title={typeLabel}>
            <ShapeSwatch shape={mark.shape} color={mark.color} size={14} />
            <span className="sr-only">{typeLabel}: </span>
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{node.label}</span>
        </h3>
        {/* mr-0: this card scrolls, so the controls can't hang past its edge */}
        <InspectorControls className="-mt-1 mr-0" step={step} onClose={onClose} />
      </div>

      {node.description && <p className="mt-1 text-[13px] leading-relaxed text-[var(--ws-ink)] [overflow-wrap:anywhere]">{node.description}</p>}

      {/* Labels keep their place on the left; a long name wraps in its own column beside them */}
      <div className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-[var(--ws-ink-soft)] [overflow-wrap:anywhere]">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0">
            Mentioned in {sources.length} {sources.length === 1 ? 'source' : 'sources'}
          </span>
          {firstSource && (
            <>
              <span className="shrink-0 text-[var(--ws-ink-faint)]" aria-hidden>·</span>
              <button
                type="button"
                onClick={() => onSelectSource(firstSource.id)}
                className="min-w-0 text-left font-medium text-[var(--ws-ink)] hover:underline cursor-pointer"
              >
                {getSourceTitle(firstSource)}
              </button>
              <MoreCount names={otherSources.map(getSourceTitle)} />
            </>
          )}
        </p>

        {firstRelation && (
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0">Relationships</span>
            {firstRelation.outgoing ? (
              <ArrowRight size={12} className="shrink-0 translate-y-px text-[var(--ws-ink-faint)]" aria-label="to" />
            ) : (
              <ArrowLeft size={12} className="shrink-0 translate-y-px text-[var(--ws-ink-faint)]" aria-label="from" />
            )}
            <button
              type="button"
              onClick={() => onSelectNode(firstRelation.other)}
              title={firstRelation.description}
              className="min-w-0 text-left hover:underline cursor-pointer"
            >
              <span className="font-semibold" style={{ color: relationColor(firstRelation.relationship, isLight) }}>
                {prettyRelation(firstRelation.relationship)}
              </span>{' '}
              <span className="font-medium text-[var(--ws-ink)]">{firstRelation.other.label}</span>
            </button>
            <MoreCount names={otherRelations.map((r) => `${prettyRelation(r.relationship)} ${r.other.label}`)} />
          </p>
        )}
      </div>
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
