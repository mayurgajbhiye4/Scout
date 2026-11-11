import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { History, Layers, Moon, Plus, Sun } from 'lucide-react';
import { sessionsApi, type Session } from '@/api/sessions';
import type { Source } from '@/api/sources';
import LogoutConfirmPopover from '@/features/auth/LogoutConfirmPopover';
import { useAuth } from '@/features/auth/useAuth';
import { openAuthDialog } from '@/features/auth/authEvents';
import { useTheme } from '@/features/theme';
import { resolveReferencedSources, splitReferences } from '@/lib/citations';
import { formatSessionTitle } from '@/lib/formatters';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import Wordmark from '@/components/brand/Wordmark';
import { useAddSource } from './canvas/AddSource';
import { BarDivider, FLOATING_BAR, FLOATING_HEADER_SPLIT, IconButton } from './FloatingBar';
import GraphCanvas from './canvas/GraphCanvas';
import MapSketch from './canvas/MapSketch';
import { ALL_RELATIONS, nextCompare, type MapScope } from './canvas/graphView';
import SourcesDock, { type EntityFocus } from './canvas/SourcesDock';
import CopilotChat from './copilot/CopilotChat';
import { useResearchChat } from './copilot/useResearchChat';
import { LEFT_PANEL_TABS, parseOpenWindows, visibleWindows, type LeftPanelTab, type WindowId } from './floatingWindows';
import PanelTabs from './PanelTabs';
import SessionsRail from './SessionsRail';
import SessionFlow from './flow/SessionFlow';
import type { FlowRow } from './flow/FlowSources';
import { getSourceKind, getSourceTitle, KIND_META } from './sourceMeta';
import type { SessionsList } from './useSessionsList';
import {
  useKnowledgeGraph,
  useMediaQuery,
  useRebuildRelations,
  useSessionSourceIds,
  useSourceIngest,
  useSourcesLibrary,
} from './useWorkspaceData';

type SessionRef = { id: string; title: string };

interface UnifiedWorkspaceProps {
  sessionId: string | null;
  sessionsList: SessionsList;
  onOpenSession: (session: SessionRef) => void;
  onNewConversation: () => void;
  onSessionDeleted: (sessionId: string) => void;
  /** Goes up each time the sessions palette opens a session or starts new research. */
  palettePicks: number;
}

const NOTHING_COMPARED: ReadonlySet<string> = new Set();
const WINDOWS_KEY = 'scout_ws_windows';
const LEFT_TAB_KEY = 'scout_ws_left_tab';

// The sessions/sources window floats below the top bar (top-3, h-12, then 12px)
const LEFT_PANEL_WIDTH = 340;
const INTRO_MS = 1000;

const windowDomId = (id: WindowId) => `ws-window-${id}`;

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode); preferences just won't persist
  }
}

function readLeftTab(): LeftPanelTab {
  try {
    const saved = localStorage.getItem(LEFT_TAB_KEY);
    return (LEFT_PANEL_TABS as readonly string[]).includes(saved ?? '') ? (saved as LeftPanelTab) : 'sessions';
  } catch {
    return 'sessions';
  }
}

/** Where a source came from, in a few words: its site, or what kind of source it is. */
function sourceOrigin(source: Source): string {
  const kind = getSourceKind(source);
  if (kind === 'notes') return 'Your notes';
  try {
    return source.canonical_uri ? new URL(source.canonical_uri).hostname.replace(/^www\./, '') : KIND_META[kind].label;
  } catch {
    return KIND_META[kind].label;
  }
}

function readOpenWindows(): WindowId[] {
  try {
    return parseOpenWindows(localStorage.getItem(WINDOWS_KEY), ['copilot']);
  } catch {
    return ['copilot'];
  }
}

/**
 * The research home: the session as one flow, its sources feeding the knowledge map and the map feeding the Research
 * Copilot. Sessions or sources (one at a time, switched in the window's title) float over it on the left, folding into
 * a launcher in the top bar; below 768px that window opens as a sheet.
 */
export default function UnifiedWorkspace({
  sessionId,
  sessionsList,
  onOpenSession,
  onNewConversation,
  onSessionDeleted,
  palettePicks,
}: UnifiedWorkspaceProps) {
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const roomForAll = useMediaQuery('(min-width: 1024px)');
  const floating = useMediaQuery('(min-width: 768px)');

  // ── Windows: the open ones, oldest first (remembered), and the one sheet on narrow screens ──
  const [openWindows, setOpenWindows] = useState<WindowId[]>(readOpenWindows);
  const [sheet, setSheet] = useState<WindowId | null>(null);
  const [leftTab, setLeftTab] = useState<LeftPanelTab>(readLeftTab);

  useEffect(() => writePref(WINDOWS_KEY, JSON.stringify(openWindows)), [openWindows]);
  useEffect(() => writePref(LEFT_TAB_KEY, leftTab), [leftTab]);

  const shown = useMemo(
    () => (floating ? visibleWindows(openWindows, roomForAll) : sheet ? [sheet] : []),
    [floating, openWindows, roomForAll, sheet]
  );
  // The chat has its own column in the flow, so only the left window ever floats
  const leftShown = shown.includes('sessions');

  const openWindow = useCallback((id: WindowId) => {
    if (floating) setOpenWindows((prev) => [...prev.filter((w) => w !== id), id]);
    else setSheet(id);
  }, [floating]);

  const closeWindow = useCallback((id: WindowId) => {
    if (floating) setOpenWindows((prev) => prev.filter((w) => w !== id));
    else setSheet((s) => (s === id ? null : s));
  }, [floating]);

  const toggleWindow = useCallback(
    (id: WindowId) => (shown.includes(id) ? closeWindow(id) : openWindow(id)),
    [closeWindow, openWindow, shown]
  );

  // A pick in the sessions palette ends the list's job just as a pick in the list does
  const [seenPalettePicks, setSeenPalettePicks] = useState(palettePicks);
  if (palettePicks !== seenPalettePicks) {
    setSeenPalettePicks(palettePicks);
    closeWindow('sessions');
  }

  // The left window shows sessions or sources; opening it on one switches to that one
  const openPanel = useCallback((tab: LeftPanelTab) => {
    setLeftTab(tab);
    openWindow('sessions');
  }, [openWindow]);

  // Windows open on load stagger in after the top bar; ones opened later open straight away
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);
  const intro = (ms: number) => (introDone ? undefined : introDelay(ms));

  // The map renders its caption and controls under its board, and the picked concept's card in the message box
  const [dockSlot, setDockSlot] = useState<HTMLDivElement | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [inspectorSlot, setInspectorSlot] = useState<HTMLDivElement | null>(null);

  // ── Cross-highlight state shared by sources, map and chat ──
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);
  const [selectedSourceIdState, setSelectedSourceId] = useState<string | null>(null);
  // Sources picked to compare belong to the session they were picked in
  const [compared, setCompared] = useState({ sessionId: null as string | null, ids: NOTHING_COMPARED });
  const [selectedEntity, setSelectedEntity] = useState<EntityFocus | null>(null);
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(null);

  // ── Data ──
  const library = useSourcesLibrary(isAuthenticated);
  const knowledge = useKnowledgeGraph(isAuthenticated);
  const relations = useRebuildRelations();
  const sessionSourceIds = useSessionSourceIds(sessionId);

  // A source added before there's a session starts one, so everything from the first action on is one session.
  // Quick drops share the one being created.
  const queryClient = useQueryClient();
  const creatingSession = useRef<Promise<string> | null>(null);
  useEffect(() => {
    creatingSession.current = null;
  }, [sessionId]);
  const ensureSession = useCallback(
    (title: string) => {
      if (creatingSession.current) return creatingSession.current;
      const promise = sessionsApi.createSession({ title: title.slice(0, 48), source_policy: 'source_first' }).then((created) => {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        onOpenSession(created);
        return created.id;
      });
      promise.catch(() => {
        creatingSession.current = null;
      });
      creatingSession.current = promise;
      return promise;
    },
    [onOpenSession, queryClient]
  );
  const ingest = useSourceIngest(sessionId, ensureSession);
  const addSource = useAddSource(ingest.ingest);
  const chat = useResearchChat({ sessionId, onSessionCreated: (s: Session) => onOpenSession(s) });

  // Finished ones linger in the copilot's status list, but the library already lists them
  const dockPending = useMemo(() => ingest.pending.filter((p) => p.status !== 'ready'), [ingest.pending]);
  const sourcesById = useMemo(() => new Map<string, Source>(library.sources.map((s) => [s.id, s])), [library.sources]);
  const entityCountBySource = useMemo(() => {
    const m = new Map<string, number>();
    knowledge.graph.entitiesBySource.forEach((set, id) => m.set(id, set.size));
    return m;
  }, [knowledge.graph]);
  const focusSourceIds = useMemo(() => {
    if (!selectedEntity) return null;
    const node = knowledge.graph.nodes.find((n) => n.id === selectedEntity.id);
    return new Set(node?.sourceIds ?? []);
  }, [knowledge.graph, selectedEntity]);
  // Selections pointing at deleted sources are treated as cleared.
  const selectedSourceId =
    selectedSourceIdState && (library.isLoading || sourcesById.has(selectedSourceIdState)) ? selectedSourceIdState : null;
  const selectedSource = selectedSourceId ? sourcesById.get(selectedSourceId) ?? null : null;

  // Only sources still in this session count, and it takes two to compare
  const comparedIds = useMemo(() => {
    if (compared.sessionId !== sessionId) return new Set<string>();
    const live = [...compared.ids].filter((id) => sessionSourceIds.has(id) && sourcesById.has(id));
    return new Set(live.length >= 2 ? live : []);
  }, [compared, sessionId, sessionSourceIds, sourcesById]);

  // Picking a source (or none) ends a comparison. Comparing only changes the map; the chat stays on the whole session.
  const selectSource = useCallback((id: string | null) => {
    setCompared({ sessionId: null, ids: NOTHING_COMPARED });
    setSelectedSourceId(id);
  }, []);

  const toggleCompare = useCallback(
    (id: string) => {
      const next = nextCompare(comparedIds, selectedSourceId, id);
      setCompared({ sessionId, ids: next.compared });
      setSelectedSourceId(next.selected);
    },
    [comparedIds, selectedSourceId, sessionId]
  );

  const askCopilot = useCallback((text: string) => {
    setDraft({ text, nonce: Date.now() });
    openWindow('copilot');
  }, [openWindow]);

  const focusCopilot = useCallback(() => {
    openWindow('copilot');
    requestAnimationFrame(() => document.getElementById('copilot-input')?.focus());
  }, [openWindow]);

  // Dropping sources on the map brings up the copilot, where they're read and indexed
  const dropOnMap = (data: DataTransfer) => {
    const result = addSource.dropSources(data);
    if (result.added > 0) openWindow('copilot');
    return result;
  };

  // Links pasted on the workspace land on the map, and show up in the copilot like dropped ones
  const pasteOnMap = (links: string[]) => {
    links.forEach((link) => ingest.ingest('web', link));
    openWindow('copilot');
  };

  // Picking a session is the end of the list's job: it folds away and hands the screen back to the session
  const openSession = (s: SessionRef) => {
    closeWindow('sessions');
    onOpenSession(s);
    openWindow('copilot');
  };

  const newConversation = () => {
    closeWindow('sessions');
    onNewConversation();
    focusCopilot();
  };

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        document.getElementById('copilot-input')?.focus();
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if (chat.status !== 'idle') {
        chat.stop();
      } else if (!floating && sheet) {
        setSheet(null);
      } else if (!typing && (selectedEntity || selectedSourceId || comparedIds.size > 0)) {
        setSelectedEntity(null);
        selectSource(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chat, comparedIds, floating, selectSource, selectedEntity, selectedSourceId, sheet]);

  const sessionTitle = sessionId ? formatSessionTitle(chat.session?.title) || 'Research session' : 'New research';

  const panelTabs = (
    <PanelTabs
      value={leftTab}
      onChange={setLeftTab}
      counts={{
        sessions: sessionsList.isLoading ? undefined : `${sessionsList.sessions.length}${sessionsList.hasNextPage ? '+' : ''}`,
        sources: isAuthenticated && library.isLoading ? undefined : library.sources.length,
      }}
    />
  );

  // ── What the map is about: the sources being compared, else the selected one, else the open session's, else nothing ──
  const mapScope = useMemo<MapScope | null>(() => {
    if (comparedIds.size > 0) return { kind: 'compare', title: `Comparing ${comparedIds.size} sources`, sourceIds: comparedIds };
    if (selectedSource) return { kind: 'source', title: getSourceTitle(selectedSource), sourceIds: new Set([selectedSource.id]) };
    if (sessionId) return { kind: 'session', title: sessionTitle, sourceIds: sessionSourceIds };
    return null;
  }, [comparedIds, selectedSource, sessionId, sessionTitle, sessionSourceIds]);
  // The relationship chip belongs to the scope it was picked in; a new scope starts back at '*'
  const scopeKey = mapScope ? `${mapScope.kind}:${[...mapScope.sourceIds].sort().join(',')}` : '';
  const [pickedRelation, setPickedRelation] = useState({ scopeKey: '', relationship: ALL_RELATIONS });
  const relationFilter = pickedRelation.scopeKey === scopeKey ? pickedRelation.relationship : ALL_RELATIONS;
  // A new conversation opens as just the prompt box, sized to fit, and grows into the full chat with the first message
  const promptBox = !sessionId && chat.messages.length === 0 && chat.status === 'idle';

  // ── The flow: this session's sources (and ones being added to it), what the last answer cited, and the map's size ──
  const flowRows = useMemo<FlowRow[]>(() => {
    const added = library.sources
      .filter((s) => sessionSourceIds.has(s.id))
      .map((s) => ({
        id: s.id,
        sourceId: s.id,
        kind: getSourceKind(s),
        title: getSourceTitle(s),
        origin: sourceOrigin(s),
        conceptCount: entityCountBySource.get(s.id) ?? 0,
      }));
    // A finished one stays until the session's list has it, so the row doesn't blink out in between
    const inFlight = ingest.pending
      .filter((p) => p.status !== 'ready' || !added.some((s) => s.title === p.title))
      .map((p) => ({ id: `pending:${p.tempId}`, kind: p.kind, title: p.title, origin: '', pending: p }));
    return [...added, ...inFlight];
  }, [entityCountBySource, ingest.pending, library.sources, sessionSourceIds]);

  const citedIds = useMemo(() => {
    const last = [...chat.messages].reverse().find((m) => m.role === 'assistant');
    if (!last || chat.status !== 'idle') return new Set<string>();
    const refs = resolveReferencedSources(last.citations ?? [], splitReferences(last.content).body);
    return new Set(refs.map((r) => r.sourceId).filter((id): id is string => Boolean(id && sessionSourceIds.has(id))));
  }, [chat.messages, chat.status, sessionSourceIds]);

  const litIds = useMemo(() => {
    const set = new Set<string>();
    if (hoveredSourceId) set.add(hoveredSourceId);
    if (selectedSourceId) set.add(selectedSourceId);
    comparedIds.forEach((id) => set.add(id));
    focusSourceIds?.forEach((id) => set.add(id));
    return set;
  }, [comparedIds, focusSourceIds, hoveredSourceId, selectedSourceId]);

  const scopedIds = useMemo(() => {
    if (comparedIds.size > 0) return comparedIds;
    return selectedSourceId ? new Set([selectedSourceId]) : null;
  }, [comparedIds, selectedSourceId]);

  const ingestingIds = useMemo(
    () => new Set(ingest.pending.filter((p) => p.status === 'ingesting').map((p) => `pending:${p.tempId}`)),
    [ingest.pending]
  );

  const mapProps = {
    graph: knowledge.graph,
    sourcesById,
    isAuthenticated,
    isLoading: knowledge.isLoading,
    isError: knowledge.isError,
    isFetching: knowledge.isFetching,
    onRetry: () => knowledge.refetch(),
    hoveredSourceId,
    selectedSourceId,
    selectedEntity,
    onHoverSource: setHoveredSourceId,
    onSelectSource: selectSource,
    onSelectEntity: setSelectedEntity,
    onAsk: askCopilot,
    onAddSource: () => addSource.openLink('web'),
    scope: mapScope,
    onOpenSources: () => openPanel('sources'),
    onOpenSessions: () => openPanel('sessions'),
    relationFilter,
    onRelationFilterChange: (relationship: string) => setPickedRelation({ scopeKey, relationship }),
    onBackToSession: sessionId && (selectedSource || comparedIds.size > 0) ? () => selectSource(null) : undefined,
    onRebuildRelations: () => relations.rebuild(),
    isRebuildingRelations: relations.isRebuilding,
    rebuildError: relations.error,
    onDropSources: dropOnMap,
    onPasteLinks: pasteOnMap,
    dropPausedFor: addSource.disabled ? addSource.cooldownSec : 0,
  };

  // What the board says while it has nothing to draw
  const mapping = ingestingIds.size > 0;
  const boardEmpty = (
    <div className="flex flex-col items-center">
      <MapSketch className="w-[78%] max-w-[300px]" />
      <p className="mt-3 max-w-[26ch] text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">
        {mapping
          ? 'Mapping your source…'
          : flowRows.length > 0
            ? "These sources aren't mapped yet."
            : 'Paste a link or add a source to map its concepts.'}
      </p>
      {!mapping && flowRows.length > 0 && (
        <button
          type="button"
          onClick={() => relations.rebuild()}
          disabled={relations.isRebuilding}
          className="ui-press mt-3 h-8 rounded-full border border-[var(--ws-line)] glass px-3 text-[12.5px] font-medium hover:border-[var(--ws-line-strong)] disabled:cursor-wait cursor-pointer"
        >
          {relations.isRebuilding ? 'Rebuilding…' : 'Rebuild map'}
        </button>
      )}
    </div>
  );

  return (
    <div className="font-ui relative h-full w-full overflow-hidden text-[var(--ws-ink)]">
      {/* ── The session as one flow: sources → knowledge map → chat ── */}
      <main className="ui-in-fade absolute inset-0">
        <SessionFlow
          rows={flowRows}
          litIds={litIds}
          citedIds={citedIds}
          ingestingIds={ingestingIds}
          scopedIds={scopedIds}
          answering={chat.status !== 'idle'}
          map={
            <GraphCanvas
              {...mapProps}
              variant="board"
              boardEmpty={boardEmpty}
              dockContainer={dockSlot}
              headerContainer={headerSlot}
              inspectorContainer={inspectorSlot}
            />
          }
          headerSlot={setHeaderSlot}
          dockSlot={setDockSlot}
          chat={
            <CopilotChat
              chat={chat}
              sessionId={sessionId}
              promptBox={promptBox}
              addSource={addSource}
              ingest={{ items: [], onRetry: ingest.retry, onDismiss: ingest.dismiss }}
              draft={draft}
              entityFocus={selectedEntity}
              conceptSlot={setInspectorSlot}
              selectedSource={selectedSource}
              onClearSource={() => selectSource(null)}
              sourcesById={sourcesById}
              onHoverSource={setHoveredSourceId}
              onSelectSource={selectSource}
            />
          }
          selectedSourceId={selectedSourceId}
          comparedIds={comparedIds}
          onHoverSource={setHoveredSourceId}
          onSelectSource={selectSource}
          onToggleCompare={toggleCompare}
          addSource={addSource}
          onRetryPending={ingest.retry}
          onDismissPending={ingest.dismiss}
        />
      </main>

      {/* ── Top bar: two pills, brand and where you are on the left, actions and you on the right ── */}
      <header className={FLOATING_HEADER_SPLIT}>
        <div className={cn(FLOATING_BAR, 'ui-in-up')}>
          <button
            type="button"
            onClick={newConversation}
            aria-label="Scout, start new research"
            title="New research (Ctrl/⌘ N)"
            className="flex h-9 shrink-0 items-center gap-2 rounded-full px-1 cursor-pointer sm:px-2"
          >
            <Wordmark />
          </button>
          <BarDivider />
          <WindowLauncher
            label={leftTab === 'sources' ? 'Sources' : 'Sessions'}
            icon={leftTab === 'sources' ? <Layers size={16} /> : <History size={16} />}
            open={leftShown}
            controls={windowDomId('sessions')}
            onClick={() => toggleWindow('sessions')}
          />
        </div>
        <div className={cn(FLOATING_BAR, 'ui-in-up')}>
          {/* The one filled control in the bar, where the visitor header has "Start researching" */}
          <button
            type="button"
            onClick={newConversation}
            aria-label="New research"
            title="New research (Ctrl/⌘ N)"
            className="ui-press flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full glass-accent bg-[var(--ws-accent)] px-2.5 text-[13px] font-semibold text-[var(--ws-on-accent)] hover:brightness-110 cursor-pointer lg:pl-2.5 lg:pr-3.5"
          >
            <Plus size={16} strokeWidth={2.4} />
            <span className="hidden lg:inline">New research</span>
          </button>
          <IconButton label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </IconButton>
          {isAuthenticated && (
            <LogoutConfirmPopover user={user} onLogout={logout} side="bottom" align="end" sideOffset={10}>
              <button
                type="button"
                aria-label="Account"
                className="ui-press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ws-accent-wash)] text-[13px] font-semibold text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30 cursor-pointer"
              >
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </button>
            </LogoutConfirmPopover>
          )}
        </div>
      </header>

      {/* On narrow screens a window is a sheet over a scrim; tapping the scrim folds it away */}
      {!floating && sheet && (
        <div aria-hidden onClick={() => setSheet(null)} className="absolute inset-0 z-20 bg-[var(--ws-scrim)] animate-in fade-in-0 duration-200" />
      )}

      {/*
        ── Sessions or sources, floating at the top left. Both stay mounted, so a filter survives switching between
        them; the key starts them afresh once the window folds, so it always reopens with empty search bars ──
      */}
      <FloatingWindow
        key={leftShown ? 'open' : 'folded'}
        id={windowDomId('sessions')}
        shown={leftShown}
        origin="origin-top-left"
        className={cn('absolute left-3 top-[72px] z-20', !floating && 'bottom-3 right-3')}
        style={floating ? { width: LEFT_PANEL_WIDTH, height: 'min(680px, calc(100% - 60px))', ...intro(100) } : undefined}
      >
        <div className={cn('h-full', leftTab !== 'sessions' && 'hidden')}>
          <SessionsRail
            list={sessionsList}
            activeId={sessionId}
            onOpen={openSession}
            onNew={newConversation}
            onDeleted={onSessionDeleted}
            onMinimize={() => closeWindow('sessions')}
            title={panelTabs}
          />
        </div>
        <div className={cn('h-full', leftTab !== 'sources' && 'hidden')}>
          <SourcesDock
            isAuthenticated={isAuthenticated}
            onSignIn={openAuthDialog}
            sources={library.sources}
            pending={dockPending}
            isLoading={isAuthenticated && library.isLoading}
            isError={library.isError}
            onReload={() => library.refetch()}
            sessionSourceIds={sessionSourceIds}
            entityCountBySource={entityCountBySource}
            hoveredSourceId={hoveredSourceId}
            selectedSourceId={selectedSourceId}
            onHoverSource={setHoveredSourceId}
            onSelectSource={selectSource}
            focusEntity={selectedEntity}
            focusSourceIds={focusSourceIds}
            onClearEntity={() => setSelectedEntity(null)}
            onAskAboutSource={(s) => {
              selectSource(s.id);
              askCopilot(`Summarize the key findings in "${getSourceTitle(s)}".`);
            }}
            addSource={addSource}
            onRetryPending={ingest.retry}
            onDismissPending={ingest.dismiss}
            onMinimize={() => closeWindow('sessions')}
            title={panelTabs}
          />
        </div>
      </FloatingWindow>

      {addSource.element}
    </div>
  );
}

/**
 * A window floating over the map. Kept mounted while folded away unless its key says otherwise; showing it again
 * replays its opening motion, out of `origin` (the corner its launcher is in).
 */
function FloatingWindow({
  id,
  label,
  shown,
  origin,
  className,
  style,
  resize,
  children,
}: {
  id: string;
  label?: string;
  shown: boolean;
  origin: string;
  className?: string;
  style?: CSSProperties;
  resize?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role={label ? 'region' : undefined}
      aria-label={label}
      className={cn('pointer-events-auto relative min-h-0', !shown && 'hidden', className)}
      style={style}
    >
      {resize}
      <div className={cn('ui-in-window h-full overflow-hidden rounded-4xl border border-[var(--ws-line)] glass', origin)}>
        {children}
      </div>
    </div>
  );
}

function WindowLauncher({
  label,
  icon,
  count,
  open,
  controls,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  count?: number;
  open: boolean;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      title={open ? `Minimize ${label.toLowerCase()}` : `Open ${label.toLowerCase()}`}
      className={cn(
        'ui-press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium cursor-pointer',
        open
          ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30'
          : 'text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {count !== undefined && <span className="hidden text-[12px] tabular-nums opacity-70 sm:inline">{count}</span>}
    </button>
  );
}
