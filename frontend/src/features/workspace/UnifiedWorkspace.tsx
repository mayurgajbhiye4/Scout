import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { History, Layers, Maximize2, MessageSquare, Moon, Plus, Sun, X } from 'lucide-react';
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
import { INGEST_STAGES } from '@/features/marketing/pipelineStages';
import { useAddSource } from './canvas/AddSource';
import { BarDivider, FLOATING_BAR, FLOATING_HEADER_SPLIT, IconButton } from './FloatingBar';
import GraphCanvas from './canvas/GraphCanvas';
import MapSketch from './canvas/MapSketch';
import { ALL_RELATIONS, nextCompare, type MapScope } from './canvas/graphView';
import SourcesDock, { type EntityFocus } from './canvas/SourcesDock';
import CopilotChat from './copilot/CopilotChat';
import { useResearchChat } from './copilot/useResearchChat';
import {
  LEFT_PANEL_TABS,
  parseCopilotMode,
  parseOpenWindows,
  visibleWindows,
  type CopilotMode,
  type LeftPanelTab,
  type WindowId,
} from './floatingWindows';
import { neighbourAfterClose, parseTabs, withTab, withoutTab, type SessionTab } from './openTabs';
import SessionsRail from './SessionsRail';
import SessionTabs from './SessionTabs';
import PipelineStrip from './PipelineStrip';
import WorkspaceBackdrop from './WorkspaceBackdrop';
import { useSceneRotation } from './workspaceScenes';
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
const TABS_KEY = 'scout_ws_tabs';
const COPILOT_MODE_KEY = 'scout_ws_copilot_mode';
// The copilot's usual width; expanded, it grows to COPILOT_EXPANDED_WIDTH
const COPILOT_WIDTH = 560;
// Expanded, the copilot is this wide at most, and runs from under the top bar to the bottom
const COPILOT_EXPANDED_WIDTH = 720;
// Windows sit 12px in from the workspace's edges, and start 72px down, below the top bar
const WINDOW_GAP = 12;
const WINDOW_TOP = 72;
// The map's controls sit this far in from the right edge: the flow's 32px padding plus the board's 16px
const BOARD_RIGHT = 48;

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

function readTabs(): SessionTab[] {
  try {
    return parseTabs(localStorage.getItem(TABS_KEY));
  } catch {
    return [];
  }
}

function readCopilotMode(): CopilotMode {
  try {
    return parseCopilotMode(localStorage.getItem(COPILOT_MODE_KEY));
  } catch {
    return 'normal';
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
 * The research home: the session as one flow, its sources feeding the knowledge map, which runs to the right edge.
 * The sessions kept open are tabs in the top bar. The full session history or the sources library (one at a time, each
 * with a launcher in the top bar) floats over the map on the left. The Research Copilot floats over the map's bottom right, Linear style: it can be widened to
 * full height, minimized to a pill in the corner, or closed (the top bar's Ask button brings it back). Below 768px each
 * window opens as a sheet.
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
  const [copilotMode, setCopilotMode] = useState<CopilotMode>(readCopilotMode);

  useEffect(() => writePref(WINDOWS_KEY, JSON.stringify(openWindows)), [openWindows]);
  useEffect(() => writePref(LEFT_TAB_KEY, leftTab), [leftTab]);
  useEffect(() => writePref(COPILOT_MODE_KEY, copilotMode), [copilotMode]);

  const shown = useMemo(
    () => (floating ? visibleWindows(openWindows, roomForAll) : sheet ? [sheet] : []),
    [floating, openWindows, roomForAll, sheet]
  );
  const leftShown = shown.includes('sessions');
  // The copilot is either up as a window or folded into its pill. On a phone the pill shows whenever no sheet is up.
  const copilotMinimized = copilotMode === 'minimized';
  const copilotExpanded = floating && copilotMode === 'expanded';
  const copilotShown = shown.includes('copilot') && !copilotMinimized;
  const copilotPill = copilotMinimized && (floating ? shown.includes('copilot') : sheet === null);

  // Opening the copilot, from anywhere, also brings it back out of its pill
  const openWindow = useCallback((id: WindowId) => {
    if (id === 'copilot') setCopilotMode((m) => (m === 'minimized' ? 'normal' : m));
    if (floating) setOpenWindows((prev) => [...prev.filter((w) => w !== id), id]);
    else setSheet(id);
  }, [floating]);

  const closeWindow = useCallback((id: WindowId) => {
    // A closed copilot leaves no pill behind, and reopens at the size it had
    if (id === 'copilot') setCopilotMode((m) => (m === 'minimized' ? 'normal' : m));
    if (floating) setOpenWindows((prev) => prev.filter((w) => w !== id));
    else setSheet((s) => (s === id ? null : s));
  }, [floating]);

  // Minimizing keeps the copilot among the open windows (on a phone, folds its sheet away) and hands focus to the pill
  const minimizeCopilot = useCallback(() => {
    setCopilotMode('minimized');
    if (!floating) setSheet((s) => (s === 'copilot' ? null : s));
    requestAnimationFrame(() => document.getElementById('copilot-pill')?.focus());
  }, [floating]);

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

  // Each has its own launcher, which folds the window away when it's already showing that one
  const togglePanel = (tab: LeftPanelTab) => {
    if (leftShown && leftTab === tab) closeWindow('sessions');
    else openPanel(tab);
  };

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

  // ── Tabs: the sessions kept open (remembered). The open session is always one of them, however it was opened ──
  const [tabs, setTabs] = useState<SessionTab[]>(readTabs);
  // The tab just closed, until the URL has moved off its session; without it the rule above would put it straight back
  const [closedTabId, setClosedTabId] = useState<string | null>(null);
  useEffect(() => writePref(TABS_KEY, JSON.stringify(tabs)), [tabs]);
  const activeTabTitle = sessionId
    ? chat.session?.title ?? sessionsList.sessions.find((s) => s.id === sessionId)?.title ?? ''
    : '';
  if (closedTabId && closedTabId !== sessionId) {
    setClosedTabId(null);
  } else if (!isAuthenticated) {
    // Signing out closes them, so the next person to sign in here doesn't see their titles
    if (tabs.length > 0) setTabs([]);
  } else if (sessionId && sessionId !== closedTabId) {
    const next = withTab(tabs, { id: sessionId, title: activeTabTitle });
    if (next !== tabs) setTabs(next);
  }

  const dropTab = (id: string) => {
    if (id === sessionId) setClosedTabId(id);
    setTabs((prev) => withoutTab(prev, id));
  };

  // Closing a tab keeps the session; closing the open one moves to the tab beside it, or to a new conversation
  const closeTab = (id: string) => {
    const neighbour = neighbourAfterClose(tabs, id);
    dropTab(id);
    if (id !== sessionId) return;
    if (neighbour) onOpenSession(neighbour);
    else onNewConversation();
  };

  const sessionDeleted = (id: string) => {
    dropTab(id);
    onSessionDeleted(id);
  };

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
  // Concepts named in an answer, matched to the knowledge map by name so the answer can show them there
  const conceptsByLabel = useMemo(() => {
    const m = new Map<string, EntityFocus>();
    knowledge.graph.nodes.forEach((n) => {
      if (n.isSource || n.isUser) return;
      const key = n.label.trim().toLowerCase();
      if (!m.has(key)) m.set(key, { id: n.id, name: n.label, type: n.type });
    });
    return m;
  }, [knowledge.graph]);
  const findConcept = useCallback((label: string) => conceptsByLabel.get(label.trim().toLowerCase()) ?? null, [conceptsByLabel]);
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

  // A source taken out of the session can't stay picked or lit; comparisons already drop sources outside the session
  const onSourceRemoved = useCallback(
    (id: string) => {
      if (selectedSourceId === id) selectSource(null);
      setHoveredSourceId((h) => (h === id ? null : h));
    },
    [selectSource, selectedSourceId]
  );

  const askCopilot = useCallback((text: string) => {
    setDraft({ text, nonce: Date.now() });
    openWindow('copilot');
  }, [openWindow]);

  const focusCopilot = useCallback(() => {
    openWindow('copilot');
    requestAnimationFrame(() => document.getElementById('copilot-input')?.focus());
  }, [openWindow]);

  // The top bar's Ask button: brings the copilot up, or folds it into its pill when it's already up
  const toggleCopilot = useCallback(() => {
    if (copilotShown) minimizeCopilot();
    else focusCopilot();
  }, [copilotShown, focusCopilot, minimizeCopilot]);

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
        // From the copilot's own input it folds the window away; from anywhere else it brings the input up
        if (copilotShown && document.activeElement?.id === 'copilot-input') minimizeCopilot();
        else focusCopilot();
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
  }, [chat, comparedIds, copilotShown, floating, focusCopilot, minimizeCopilot, selectSource, selectedEntity, selectedSourceId, sheet]);

  const sessionTitle = sessionId ? formatSessionTitle(chat.session?.title) || 'Research session' : 'New research';

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

  const ingesting = useMemo(
    () => ingest.pending.flatMap((p) => (p.status === 'ingesting' ? [p] : [])),
    [ingest.pending]
  );
  const ingestingIds = useMemo(() => new Set(ingesting.map((p) => `pending:${p.tempId}`)), [ingesting]);

  // Each source starting to be read, and each answer starting, moves the backdrop on to its next landscape
  const ingestingKeys = useMemo(() => ingesting.map((p) => `${p.tempId}:${p.attempt ?? 0}`), [ingesting]);
  const scene = useSceneRotation({ ingestingKeys, answering: chat.status !== 'idle' });

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

  // How much of the board's bottom edge the open copilot covers: its width and gaps, less the board's own inset
  const copilotOuterWidth = copilotExpanded ? COPILOT_EXPANDED_WIDTH : COPILOT_WIDTH;
  const rightInset = floating && copilotShown ? Math.max(0, copilotOuterWidth + WINDOW_GAP * 2 - BOARD_RIGHT) : 0;

  // While a source is read, the board runs the first stages of the pipeline: read, then chunked and embedded. The
  // request doesn't report its progress, so the phase is the one useSourceIngest times.
  const mapping = ingesting.length > 0;
  const ingestStage = ingesting.some((p) => p.phase === 'reading') ? 0 : 1;
  let ingestCopy = ingestStage === 0 ? 'Reading your source…' : 'Indexing passages…';
  if (ingesting.length > 1) ingestCopy = `Mapping ${ingesting.length} sources…`;

  // Board notes centre on the part of the board the copilot leaves in view
  const copilotInset = roomForAll ? rightInset : 0;

  // What the board says while it has nothing to draw
  const boardEmpty = (
    <div className="flex w-full min-w-0 flex-col items-center" style={{ paddingRight: copilotInset }}>
      {mapping ? (
        <PipelineStrip stages={INGEST_STAGES} active={ingestStage} titles size="md" className="w-full max-w-[360px]" />
      ) : (
        <MapSketch className="w-[78%] max-w-[300px]" />
      )}
      <p className={cn('max-w-[26ch] text-[13px] leading-relaxed text-[var(--ws-ink-soft)]', mapping ? 'mt-5' : 'mt-3')}>
        {mapping
          ? ingestCopy
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

  // Over a map that's already drawn, the same stages ride in a pill along the board's top
  const boardActivity = mapping && (
    <div
      className="ui-in-up flex min-w-0 items-center gap-3 rounded-full border border-[var(--ws-line)] glass py-1.5 pl-2 pr-4"
      style={{ marginRight: copilotInset }}
    >
      <PipelineStrip stages={INGEST_STAGES} active={ingestStage} className="w-[150px] shrink-0" />
      <span className="min-w-0 truncate text-[12.5px] text-[var(--ws-ink-soft)]">{ingestCopy}</span>
    </div>
  );

  return (
    <div className="font-ui relative h-full w-full overflow-hidden text-[var(--ws-ink)]">
      <WorkspaceBackdrop index={scene.index} previous={scene.previous} />

      {/* ── The session as one flow: sources → knowledge map → chat ── */}
      <main className="ui-in-fade absolute inset-0">
        <SessionFlow
          rows={flowRows}
          litIds={litIds}
          citedIds={citedIds}
          ingestingIds={ingestingIds}
          scopedIds={scopedIds}
          map={
            <GraphCanvas
              {...mapProps}
              variant="board"
              boardEmpty={boardEmpty}
              boardActivity={boardActivity}
              dockContainer={dockSlot}
              headerContainer={headerSlot}
              inspectorContainer={inspectorSlot}
            />
          }
          headerSlot={setHeaderSlot}
          dockSlot={setDockSlot}
          rightInset={rightInset}
          selectedSourceId={selectedSourceId}
          comparedIds={comparedIds}
          onHoverSource={setHoveredSourceId}
          onSelectSource={selectSource}
          onToggleCompare={toggleCompare}
          addSource={addSource}
          onRetryPending={ingest.retry}
          onDismissPending={ingest.dismiss}
          sessionId={sessionId}
          onSourceRemoved={onSourceRemoved}
        />
      </main>

      {/* ── Top bar: two pills, brand and where you are on the left, actions and you on the right ── */}
      <header className={FLOATING_HEADER_SPLIT}>
        <div className={cn(FLOATING_BAR, 'ui-in-up')}>
          <button
            type="button"
            onClick={newConversation}
            aria-label="Dusk, start new research"
            title="New research (Ctrl/⌘ N)"
            className="flex h-9 shrink-0 items-center gap-2 rounded-full px-1 cursor-pointer sm:px-2"
          >
            <Wordmark />
          </button>
          <BarDivider />
          <WindowLauncher
            label="History"
            icon={<History size={16} aria-hidden />}
            open={leftShown && leftTab === 'sessions'}
            controls={windowDomId('sessions')}
            onClick={() => togglePanel('sessions')}
          />
          <WindowLauncher
            label="Sources"
            icon={<Layers size={16} aria-hidden />}
            open={leftShown && leftTab === 'sources'}
            controls={windowDomId('sessions')}
            onClick={() => togglePanel('sources')}
          />
        </div>
        {/* Phones have no room for a strip; there the history sheet and the palette switch sessions */}
        {floating && isAuthenticated && (
          <SessionTabs
            tabs={tabs}
            activeId={sessionId}
            busy={chat.status !== 'idle'}
            onSelect={onOpenSession}
            onClose={closeTab}
            onNew={newConversation}
          />
        )}
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
          <WindowLauncher
            label="Ask"
            title={copilotShown ? 'Minimize Research Copilot (Ctrl/⌘ J)' : 'Ask the Research Copilot (Ctrl/⌘ J)'}
            icon={<MessageSquare size={16} aria-hidden />}
            open={copilotShown}
            busy={!copilotShown && chat.status !== 'idle'}
            controls={windowDomId('copilot')}
            onClick={toggleCopilot}
          />
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
        <div aria-hidden onClick={() => setSheet(null)} className="absolute inset-0 z-20 bg-[var(--ws-scrim)] animate-[uiFadeIn_240ms_var(--ease-out-quart)]" />
      )}

      {/*
        ── The session history or the sources library, floating at the top left. Both stay mounted, so a filter survives
        switching between them; the key starts them afresh once the window folds, so it always reopens with empty search bars ──
      */}
      <FloatingWindow
        key={leftShown ? 'open' : 'folded'}
        id={windowDomId('sessions')}
        shown={leftShown}
        origin="origin-top-left"
        asSheet={!floating}
        className={cn('absolute left-3 top-[72px] z-20', !floating && 'bottom-3 right-3')}
        style={floating ? { width: LEFT_PANEL_WIDTH, height: 'min(680px, calc(100% - 60px))', ...intro(100) } : undefined}
      >
        <div className={cn('h-full', leftTab !== 'sessions' && 'hidden')}>
          <SessionsRail
            list={sessionsList}
            activeId={sessionId}
            onOpen={openSession}
            onNew={newConversation}
            onDeleted={sessionDeleted}
            onMinimize={() => closeWindow('sessions')}
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
          />
        </div>
      </FloatingWindow>

      {/*
        ── The Research Copilot, floating over the map's bottom right. It stays mounted while minimized, so a half-typed
        question and the scroll position survive folding it away ──
      */}
      <FloatingWindow
        id={windowDomId('copilot')}
        label="Research Copilot"
        shown={copilotShown}
        origin="origin-bottom-right"
        asSheet={!floating}
        className={cn(
          'absolute z-20',
          floating ? 'bottom-3 right-3' : 'inset-x-3 bottom-3 top-[72px]',
          floating && 'ws-motion transition-[width,height] duration-300 ws-ease'
        )}
        style={floating ? copilotWindowStyle(copilotExpanded, promptBox, intro(160)) : undefined}
      >
        <CopilotChat
          chat={chat}
          sessionId={sessionId}
          promptBox={promptBox && !copilotExpanded}
          addSource={addSource}
          ingest={{ items: [], onRetry: ingest.retry, onDismiss: ingest.dismiss }}
          onMinimize={minimizeCopilot}
          onToggleExpand={floating ? () => setCopilotMode((m) => (m === 'expanded' ? 'normal' : 'expanded')) : undefined}
          expanded={copilotExpanded}
          onClose={() => closeWindow('copilot')}
          draft={draft}
          entityFocus={selectedEntity}
          conceptSlot={setInspectorSlot}
          selectedSource={selectedSource}
          onClearSource={() => selectSource(null)}
          sourcesById={sourcesById}
          onHoverSource={setHoveredSourceId}
          onSelectSource={selectSource}
          findConcept={findConcept}
          onFocusConcept={setSelectedEntity}
        />
      </FloatingWindow>

      {copilotPill && (
        <CopilotPill
          title={sessionTitle}
          answering={chat.status !== 'idle'}
          onRestore={focusCopilot}
          onExpand={
            floating
              ? () => {
                  setCopilotMode('expanded');
                  requestAnimationFrame(() => document.getElementById('copilot-input')?.focus());
                }
              : undefined
          }
          onClose={() => closeWindow('copilot')}
        />
      )}

      {addSource.element}
    </div>
  );
}

/**
 * The copilot window's size. Usual: 560px wide, up to 680px tall. Expanded: 720px wide and from under the top bar to
 * the bottom. A new conversation's prompt box hugs its content until the first message.
 * Both sizes are lengths, so the switch between them can ease.
 */
function copilotWindowStyle(expanded: boolean, promptBox: boolean, intro?: CSSProperties): CSSProperties {
  const room = `calc(100% - ${WINDOW_TOP + WINDOW_GAP}px)`;
  let height: string | undefined = `min(680px, ${room})`;
  if (expanded) height = room;
  else if (promptBox) height = undefined;
  return {
    width: expanded ? `min(${COPILOT_EXPANDED_WIDTH}px, calc(100% - ${WINDOW_GAP * 2}px))` : COPILOT_WIDTH,
    maxWidth: `calc(100% - ${WINDOW_GAP * 2}px)`,
    height,
    maxHeight: room,
    ...intro,
  };
}

/**
 * The copilot, minimized: a pill in the bottom-right corner naming the session and whether an answer is on its way.
 * The pill itself brings the window back; expand and close sit beside it.
 */
export function CopilotPill({
  title,
  answering,
  onRestore,
  onExpand,
  onClose,
}: {
  title: string;
  answering: boolean;
  onRestore: () => void;
  onExpand?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ui-in-window origin-bottom-right pointer-events-auto absolute bottom-3 right-3 z-20 flex h-11 max-w-[calc(100%-24px)] items-center gap-0.5 rounded-full border border-[var(--ws-line)] glass px-1">
      <button
        id="copilot-pill"
        type="button"
        onClick={onRestore}
        aria-controls={windowDomId('copilot')}
        aria-expanded={false}
        title="Open Research Copilot (Ctrl/⌘ J)"
        className="ui-press flex h-9 min-w-0 items-center gap-2 rounded-full pl-2.5 pr-3 text-[13px] hover:bg-[var(--ws-card-hover)] cursor-pointer"
      >
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', answering ? 'animate-pulse bg-[var(--ws-accent)]' : 'bg-[var(--ws-line-strong)]')}
        />
        <span className="min-w-0 max-w-[220px] truncate font-medium text-[var(--ws-ink)]">{title}</span>
        <span className="shrink-0 text-[12px] text-[var(--ws-ink-faint)]">
          {answering ? 'Answering…' : 'Copilot'}
        </span>
      </button>
      {onExpand && (
        <IconButton label="Expand Research Copilot" onClick={onExpand} className="h-8 w-8">
          <Maximize2 size={14} aria-hidden />
        </IconButton>
      )}
      <IconButton label="Close Research Copilot" onClick={onClose} className="h-8 w-8">
        <X size={16} aria-hidden />
      </IconButton>
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
  asSheet = false,
  className,
  style,
  children,
}: {
  id: string;
  label?: string;
  shown: boolean;
  origin: string;
  /** On narrow screens the window is a sheet: it rises on the drawer curve instead of opening out of `origin`. */
  asSheet?: boolean;
  className?: string;
  style?: CSSProperties;
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
      <div className={cn('h-full overflow-hidden rounded-4xl border border-[var(--ws-line)] glass', asSheet ? 'ui-in-sheet' : ['ui-in-window', origin])}>
        {children}
      </div>
    </div>
  );
}

function WindowLauncher({
  label,
  title,
  icon,
  count,
  open,
  busy = false,
  controls,
  onClick,
}: {
  label: string;
  /** Tooltip; by default it says whether the click opens or minimizes the window. */
  title?: string;
  icon: ReactNode;
  count?: number;
  open: boolean;
  /** Something is happening in the window while it's out of sight: a small accent dot on the launcher. */
  busy?: boolean;
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
      title={title ?? (open ? `Minimize ${label.toLowerCase()}` : `Open ${label.toLowerCase()}`)}
      className={cn(
        'ui-press relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium cursor-pointer',
        open
          ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30'
          : 'text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {count !== undefined && <span className="hidden text-[12px] tabular-nums opacity-70 sm:inline">{count}</span>}
      {busy && (
        <>
          <span aria-hidden className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-[var(--ws-accent)]" />
          <span className="sr-only">, answering</span>
        </>
      )}
    </button>
  );
}
