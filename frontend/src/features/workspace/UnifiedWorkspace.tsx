import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Columns2,
  Home,
  LayoutGrid,
  LogIn,
  Moon,
  Network,
  Plus,
  Search,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Session } from '@/api/sessions';
import type { Source } from '@/api/sources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LogoutConfirmPopover from '@/features/auth/LogoutConfirmPopover';
import { useAuth } from '@/features/auth/useAuth';
import { useTheme } from '@/features/theme';
import { formatSessionTitle } from '@/lib/formatters';
import { soundEffects, useSoundEffects } from '@/lib/soundEffects';
import { cn } from '@/lib/utils';
import { useAddSource } from './canvas/AddSource';
import GraphCanvas, { type ClusterMode } from './canvas/GraphCanvas';
import SourcesDock, { type EntityFocus } from './canvas/SourcesDock';
import UnifiedKnowledgeCanvas, { type ViewMode } from './canvas/UnifiedKnowledgeCanvas';
import CopilotChat from './copilot/CopilotChat';
import CopilotDrawer from './copilot/CopilotDrawer';
import CopilotTogglePill from './copilot/CopilotTogglePill';
import { useResearchChat } from './copilot/useResearchChat';
import { getSourceTitle } from './sourceMeta';
import { CHAT_BOUNDS, DOCK_BOUNDS, GRAPH_MIN_WIDTH, clampWidth, useElementWidth, usePanelWidth } from './usePanelWidth';
import {
  useKnowledgeGraph,
  useMediaQuery,
  useSessionSourceIds,
  useSourceIngest,
  useSourcesLibrary,
} from './useWorkspaceData';

type SessionRef = { id: string; title: string };

interface UnifiedWorkspaceProps {
  sessionId: string | null;
  initialPrompt: string | null;
  sessions: SessionRef[];
  onOpenSession: (session: SessionRef) => void;
  onNewConversation: () => void;
  onSessionDeleted: () => void;
  onExit: () => void;
  onOpenSearch: () => void;
  onOpenGallery: () => void;
}

const VIEW_KEY = 'scout_ws_view';
const COPILOT_KEY = 'scout_ws_copilot';
const CLUSTER_KEY = 'scout_ws_cluster';
const DOCK_WIDTH_KEY = 'scout_ws_dock_width';
const CHAT_WIDTH_KEY = 'scout_ws_chat_width';
/** Gap left beside an overlay drawer so the scrim stays clickable */
const OVERLAY_GUTTER = 48;

function readPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode); preferences just won't persist
  }
}

const VIEWS: Array<{ id: ViewMode; label: string; icon: typeof Columns2; shortcut: string }> = [
  { id: 'split', label: 'Split', icon: Columns2, shortcut: '2' },
  { id: 'graph', label: 'Graph', icon: Network, shortcut: '3' },
  { id: 'sources', label: 'Sources', icon: LayoutGrid, shortcut: '4' },
];

export default function UnifiedWorkspace({
  sessionId,
  initialPrompt,
  sessions,
  onOpenSession,
  onNewConversation,
  onSessionDeleted,
  onExit,
  onOpenSearch,
  onOpenGallery,
}: UnifiedWorkspaceProps) {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { soundEnabled, toggleSound } = useSoundEffects();
  const isDocked = useMediaQuery('(min-width: 1280px)');

  // ── Layout state ──
  const [viewMode, setViewMode] = useState<ViewMode>(() => readPref(VIEW_KEY, ['split', 'graph', 'sources'] as const) ?? 'split');
  const [copilotOpen, setCopilotOpen] = useState<boolean>(() => {
    const saved = readPref(COPILOT_KEY, ['open', 'closed'] as const);
    if (saved) return saved === 'open';
    return typeof window !== 'undefined' && window.innerWidth >= 1280;
  });
  const [clusterMode, setClusterMode] = useState<ClusterMode>(() => readPref(CLUSTER_KEY, ['source', 'type'] as const) ?? 'source');
  const [dockDrawerOpen, setDockDrawerOpen] = useState(false);

  // ── Resizable panels: sources | graph | chat. The graph takes what's left but never less than
  // GRAPH_MIN_WIDTH, so each side panel's max shrinks as the other one grows.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [bodyRef, bodyWidth] = useElementWidth<HTMLDivElement>();
  const [dockWidth, setDockWidth] = usePanelWidth(DOCK_WIDTH_KEY, DOCK_BOUNDS);
  const [chatWidth, setChatWidth] = usePanelWidth(CHAT_WIDTH_KEY, CHAT_BOUNDS);
  const available = bodyWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440);
  const dockInline = viewMode === 'split' && isWide;
  const chatInline = isDocked && copilotOpen;
  const dockMaxInline = Math.min(DOCK_BOUNDS.max, available - (chatInline ? chatWidth : 0) - GRAPH_MIN_WIDTH);
  const dockMaxDrawer = Math.min(DOCK_BOUNDS.max, available - OVERLAY_GUTTER);
  const effectiveDockWidth = clampWidth(dockWidth, DOCK_BOUNDS.min, dockInline ? dockMaxInline : dockMaxDrawer);
  const chatMax = isDocked
    ? Math.min(CHAT_BOUNDS.max, available - (dockInline ? effectiveDockWidth : 0) - GRAPH_MIN_WIDTH)
    : Math.min(CHAT_BOUNDS.max, available - OVERLAY_GUTTER);
  const effectiveChatWidth = clampWidth(chatWidth, CHAT_BOUNDS.min, chatMax);

  useEffect(() => writePref(VIEW_KEY, viewMode), [viewMode]);
  useEffect(() => writePref(COPILOT_KEY, copilotOpen ? 'open' : 'closed'), [copilotOpen]);
  useEffect(() => writePref(CLUSTER_KEY, clusterMode), [clusterMode]);

  // ── Cross-highlight state shared by dock, map and chat ──
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);
  const [selectedSourceIdState, setSelectedSourceId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityFocus | null>(null);
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(null);

  // ── Data ──
  const library = useSourcesLibrary(isAuthenticated);
  const knowledge = useKnowledgeGraph(isAuthenticated);
  const sessionSourceIds = useSessionSourceIds(sessionId);
  const ingest = useSourceIngest(sessionId);
  const addSource = useAddSource(ingest.ingest);
  const chat = useResearchChat({ sessionId, onSessionCreated: (s: Session) => onOpenSession(s) });

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

  // A prompt handed over from Explore should be visible as it streams.
  const [shownPrompt, setShownPrompt] = useState<string | null>(null);
  if (initialPrompt && initialPrompt !== shownPrompt) {
    setShownPrompt(initialPrompt);
    setCopilotOpen(true);
  }

  const toggleCopilot = useCallback(() => {
    soundEffects.playNavClick();
    setCopilotOpen((o) => !o);
  }, []);

  const changeView = useCallback((mode: ViewMode) => {
    soundEffects.playNavClick();
    setViewMode(mode);
    setDockDrawerOpen(false);
  }, []);

  const askCopilot = useCallback((text: string) => {
    setDraft({ text, nonce: Date.now() });
    setCopilotOpen(true);
  }, []);

  const selectSource = useCallback((id: string | null) => {
    setSelectedSourceId(id);
    if (id && viewMode === 'sources') setViewMode('split');
  }, [viewMode]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleCopilot();
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if (mod && !typing && ['2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        changeView(VIEWS.find((v) => v.shortcut === e.key)!.id);
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (chat.status !== 'idle') {
        chat.stop();
      } else if (copilotOpen && !isDocked) {
        setCopilotOpen(false);
      } else if (dockDrawerOpen) {
        setDockDrawerOpen(false);
      } else if (!typing && (selectedEntity || selectedSourceId)) {
        setSelectedEntity(null);
        setSelectedSourceId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeView, chat, copilotOpen, dockDrawerOpen, isDocked, selectedEntity, selectedSourceId, toggleCopilot]);

  const sessionTitle = sessionId ? formatSessionTitle(chat.session?.title) || 'Research session' : null;

  return (
    <div className="font-ui flex h-full w-full flex-col bg-[var(--ws-canvas)] text-[var(--ws-ink)]">
      {/* ── Top bar ── */}
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onExit}
          aria-label="Scout home"
          title="Back to Explore (Ctrl/⌘ 1)"
          className="flex h-9 shrink-0 items-center gap-2 rounded-[9px] pr-1 cursor-pointer"
        >
          <span className="font-arcade text-[19px] font-bold leading-none tracking-wider">SCOUT</span>
          <span className="hidden items-center gap-[3px] sm:flex" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-3.5 w-[5px] -skew-x-[18deg] rounded-[1px] bg-[var(--ws-accent)]" style={{ opacity: 1 - i * 0.22 }} />
            ))}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-[var(--ws-line)] px-3 text-[13px] font-medium hover:border-[var(--ws-line-strong)] lg:flex cursor-pointer"
            >
              Sources + Graph
              <ChevronDown size={14} className="text-[var(--ws-ink-faint)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="font-ui w-60">
            <DropdownMenuItem onSelect={onExit} className="gap-2 text-[13px]">
              <Home size={14} /> Explore home
              <kbd className="ml-auto font-mono text-[11px] text-[var(--ws-ink-faint)]">⌘1</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onNewConversation} className="gap-2 text-[13px]">
              <Plus size={14} /> New conversation
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenGallery} className="gap-2 text-[13px]">
              <LayoutGrid size={14} /> All sessions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-1 justify-center">
          <div role="tablist" aria-label="Workspace view" className="flex rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] p-0.5">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = viewMode === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeView(v.id)}
                  title={`${v.label} view (Ctrl/⌘ ${v.shortcut})`}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors sm:px-3.5 cursor-pointer',
                    active
                      ? 'bg-[var(--ws-dock)] text-[var(--ws-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-[var(--ws-line)]'
                      : 'text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)]'
                  )}
                >
                  <Icon size={15} className={active ? 'text-[var(--ws-accent-ink)]' : undefined} />
                  <span className="hidden sm:inline">{v.label}</span>
                  <span className="hidden lg:inline"> view</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search sessions"
          className="hidden h-9 w-56 shrink-0 items-center gap-2 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-3 text-[13px] text-[var(--ws-ink-faint)] hover:border-[var(--ws-line-strong)] xl:flex cursor-pointer"
        >
          <Search size={15} />
          Search sessions
          <kbd className="ml-auto rounded-[6px] border border-[var(--ws-line)] px-1.5 font-mono text-[11px]">⌘K</kbd>
        </button>
        <IconButton label="Search sessions (Ctrl/⌘ K)" onClick={onOpenSearch} className="xl:hidden">
          <Search size={16} />
        </IconButton>

        <button
          type="button"
          onClick={toggleCopilot}
          aria-pressed={copilotOpen}
          title="Toggle Research Copilot (Ctrl/⌘ J)"
          className={cn(
            'flex h-9 shrink-0 items-center gap-2 rounded-[12px] border px-2.5 text-[13px] font-semibold transition-colors sm:px-3 cursor-pointer',
            copilotOpen
              ? 'border-[var(--ws-accent)]/50 bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)]'
              : 'border-[var(--ws-line)] text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)]'
          )}
        >
          <Sparkles size={16} />
          <span className="hidden md:inline">Research Copilot</span>
          {chat.status !== 'idle' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ws-accent)]" aria-label="Copilot is working" />}
        </button>

        <div className="hidden items-center gap-0.5 sm:flex">
          <IconButton label={soundEnabled ? 'Mute sound effects' : 'Turn on sound effects'} onClick={toggleSound}>
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </IconButton>
          <IconButton label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </IconButton>
        </div>

        {isAuthenticated ? (
          <LogoutConfirmPopover user={user} onLogout={logout} side="bottom" align="end" sideOffset={10}>
            <button
              type="button"
              aria-label="Account"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[var(--ws-accent-wash)] text-[13px] font-semibold text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30 cursor-pointer"
            >
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </button>
          </LogoutConfirmPopover>
        ) : (
          <IconButton label="Log in" onClick={() => navigate('/login')}>
            <LogIn size={16} />
          </IconButton>
        )}
      </header>

      {/* ── Body ── */}
      <div ref={bodyRef} className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <UnifiedKnowledgeCanvas
            viewMode={viewMode}
            sourceCount={library.sources.length}
            dockDrawerOpen={dockDrawerOpen}
            onDockDrawerChange={setDockDrawerOpen}
            dock={{ width: dockWidth, maxInline: dockMaxInline, maxDrawer: dockMaxDrawer, onResize: setDockWidth }}
            renderDock={({ layout, onClose }) => (
              <SourcesDock
                layout={layout}
                isAuthenticated={isAuthenticated}
                onSignIn={() => navigate('/login')}
                sources={library.sources}
                pending={ingest.pending}
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
                  setSelectedSourceId(s.id);
                  askCopilot(`Summarize the key findings in "${getSourceTitle(s)}".`);
                }}
                addSource={addSource}
                onRetryPending={ingest.retry}
                onDismissPending={ingest.dismiss}
                onClose={onClose}
              />
            )}
            renderGraph={({ headerStart }) => (
              <GraphCanvas
                graph={knowledge.graph}
                sourcesById={sourcesById}
                isAuthenticated={isAuthenticated}
                isLoading={knowledge.isLoading}
                isError={knowledge.isError}
                isFetching={knowledge.isFetching}
                onRetry={() => knowledge.refetch()}
                hoveredSourceId={hoveredSourceId}
                selectedSourceId={selectedSourceId}
                selectedEntity={selectedEntity}
                onHoverSource={setHoveredSourceId}
                onSelectSource={selectSource}
                onSelectEntity={setSelectedEntity}
                onAsk={askCopilot}
                onAddSource={() => addSource.openLink('web')}
                clusterMode={clusterMode}
                onClusterModeChange={setClusterMode}
                headerStart={headerStart}
              />
            )}
          />
          <CopilotTogglePill visible={!copilotOpen} status={chat.status} sessionTitle={sessionTitle} onOpen={toggleCopilot} />
        </main>

        {/* Docked mode is a sibling column; overlay mode floats over the whole body. */}
        <CopilotDrawer
          open={copilotOpen}
          mode={isDocked ? 'docked' : 'overlay'}
          onClose={() => setCopilotOpen(false)}
          width={effectiveChatWidth}
          maxWidth={chatMax}
          onWidthChange={setChatWidth}
        >
          <CopilotChat
            chat={chat}
            sessionId={sessionId}
            sessions={sessions}
            onSelectSession={onOpenSession}
            onNewSession={onNewConversation}
            onSessionDeleted={onSessionDeleted}
            onCollapse={() => setCopilotOpen(false)}
            initialPrompt={initialPrompt}
            draft={draft}
            entityFocus={selectedEntity}
            onClearEntity={() => setSelectedEntity(null)}
            selectedSource={selectedSource}
            onClearSource={() => setSelectedSourceId(null)}
            sourcesById={sourcesById}
            onHoverSource={setHoveredSourceId}
            onSelectSource={selectSource}
          />
        </CopilotDrawer>
      </div>

      {addSource.element}
    </div>
  );
}

function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer',
        className
      )}
    >
      {children}
    </button>
  );
}
