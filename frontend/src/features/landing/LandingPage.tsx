import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  X,
  Network,
  MessageSquare,
  Trash2,
  Loader2,
  Search,
} from '@/components/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { sessionsApi } from '@/api/sessions';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import LogoutConfirmPopover from '@/features/auth/LogoutConfirmPopover';
import LandingSessionsWindow from '@/features/landing/LandingSessionsWindow';
import UnifiedWorkspace from '@/features/workspace/UnifiedWorkspace';
import HomeComposer from '@/features/landing/HomeComposer';
import { useAuth } from '@/features/auth/useAuth';
import {
  formatSessionTitle,
  formatRelativeTime,
} from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { introDelay, staggerDelay } from '@/lib/motion';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { Home, LayoutGrid, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/features/theme';
import { KIND_ICON } from '@/features/workspace/canvas/addSourceOptions';
import { kindColor, type SourceKind } from '@/features/workspace/sourceMeta';
import homeBackgroundDark from '@/assets/backgrounds/teal-curves-dark.jpg';
import homeBackgroundLight from '@/assets/backgrounds/teal-waves-light.jpg';
import { openAuthDialog } from '@/features/auth/authEvents';
import MarketingNav from '@/features/marketing/MarketingNav';
import SourceTypesRow from '@/features/marketing/SourceTypesRow';
import SourceMapDiagram from '@/features/marketing/SourceMapDiagram';

export interface HorizonTab {
  id: string;
  title: string;
}

const SESSIONS_PAGE_SIZE = 20;

// Home backdrops: both photos are by Pawel Czerwinski, free under the Unsplash License
// (unsplash.com/photos/H8kzolaZjIM for dark, unsplash.com/photos/kj8_P9d5tpo for light).

interface SourceSummary {
  source_type?: string | null;
  canonical_uri?: string | null;
  title?: string | null;
}

/** Workspace source kind of a session's source, for its icon and color in the sessions palette. */
function getSessionSourceKind(source: SourceSummary): SourceKind {
  const type = (source.source_type || '').toLowerCase();
  const uri = (source.canonical_uri || '').toLowerCase();
  const title = (source.title || '').toLowerCase();
  if (type === 'youtube' || uri.includes('youtube.com') || uri.includes('youtu.be')) return 'youtube';
  if (type === 'github' || uri.includes('github.com')) return 'github';
  if (type === 'pdf' || uri.endsWith('.pdf') || title.endsWith('.pdf')) return 'pdf';
  return 'web';
}

function HeaderIconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'ui-press grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer',
        className
      )}
    >
      {children}
    </button>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [isSessionsFlyoutOpen, setIsSessionsFlyoutOpen] = useState<boolean>(false);
  const [sessionsSearchQuery, setSessionsSearchQuery] = useState<string>('');
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);

  // Reset the palette highlight whenever the query or open state changes.
  const paletteKey = JSON.stringify([sessionsSearchQuery, isSessionsFlyoutOpen]);
  const [lastPaletteKey, setLastPaletteKey] = useState(paletteKey);
  if (paletteKey !== lastPaletteKey) {
    setLastPaletteKey(paletteKey);
    setSelectedSessionIndex(0);
  }
  const [openTabs, setOpenTabs] = useState<HorizonTab[]>(() => {
    try {
      const saved = localStorage.getItem('scout_horizon_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((t) => t && t.id && t.id !== 'explore');
        }
      }
    } catch {
      // ignore JSON errors
    }
    return [];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (routeSessionId) return routeSessionId;
    const saved = localStorage.getItem('scout_horizon_active_tab');
    if (saved) return saved;
    return 'explore';
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(routeSessionId || null);

  useEffect(() => {
    try {
      localStorage.setItem('scout_horizon_tabs', JSON.stringify(openTabs));
    } catch {
      // ignore
    }
  }, [openTabs]);

  useEffect(() => {
    try {
      localStorage.setItem('scout_horizon_active_tab', activeTabId);
    } catch {
      // ignore
    }
  }, [activeTabId]);

  // Sources + Graph + Copilot workspace. Its layout and selection state live in UnifiedWorkspace.
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(() => Boolean(routeSessionId));

  // Open (or focus) the tab for the session in the URL whenever it changes.
  const [syncedRouteSessionId, setSyncedRouteSessionId] = useState<string | undefined>(undefined);
  if (routeSessionId && routeSessionId !== syncedRouteSessionId) {
    setSyncedRouteSessionId(routeSessionId);
    setActiveTabId(routeSessionId);
    setActiveSessionId(routeSessionId);
    setIsWorkspaceOpen(true);
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === routeSessionId)) return prev;
      return [
        ...prev,
        {
          id: routeSessionId,
          title: 'Research Session',
        },
      ];
    });
  }

  const [initialChatPrompt, setInitialChatPrompt] = useState<string | null>(null);
  const [showSessionsGallery, setShowSessionsGallery] = useState<boolean>(false);
  // Bumped by "New research" so the home composer starts over with an empty draft
  const [composerKey, setComposerKey] = useState<number>(0);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarSentinelRef = useRef<HTMLDivElement>(null);

  // `prompt` is only passed when Explore hands a fresh question to the new session; opening any
  // other session clears it so it can't be re-sent there.
  const openSessionTab = (session: { id: string; title: string }, prompt: string | null = null) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === session.id)) return prev;
      return [...prev, { id: session.id, title: session.title }];
    });
    setInitialChatPrompt(prompt);
    setActiveTabId(session.id);
    setActiveSessionId(session.id);
    setIsWorkspaceOpen(true);
    setShowSessionsGallery(false);
    setIsSessionsFlyoutOpen(false);
    navigate(`/sessions/${session.id}`);
  };

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setOpenTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const lastTab = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : undefined;
        if (lastTab) {
          setActiveTabId(lastTab.id);
          setActiveSessionId(lastTab.id);
          navigate(`/sessions/${lastTab.id}`);
        } else {
          setActiveTabId('explore');
          setActiveSessionId(null);
          setIsWorkspaceOpen(false);
          navigate('/');
        }
      }
      return nextTabs;
    });
  };

  const switchToExplore = () => {
    setActiveTabId('explore');
    setActiveSessionId(null);
    setIsWorkspaceOpen(false);
    setShowSessionsGallery(false);
    if (window.location.pathname !== '/') {
      navigate('/');
    }
  };

  const handleNewChat = () => {
    switchToExplore();
    setInitialChatPrompt(null);
    setComposerKey((k) => k + 1);
    setIsSessionsFlyoutOpen(false);
  };

  // Clears the active session but stays in the workspace; the copilot creates a session on first send.
  const startWorkspaceConversation = () => {
    setActiveTabId('explore');
    setActiveSessionId(null);
    setInitialChatPrompt(null);
    setIsWorkspaceOpen(true);
    setShowSessionsGallery(false);
    if (window.location.pathname !== '/') navigate('/');
  };

  const openWorkspace = () => {
    setIsWorkspaceOpen(true);
    setShowSessionsGallery(false);
  };

  const toggleSessionsFlyout = () => {
    setIsSessionsFlyoutOpen((prev) => !prev);
  };

  const openSessionsGallery = () => {
    setShowSessionsGallery(true);
    setActiveSessionId(null);
    setIsWorkspaceOpen(false);
    setIsSessionsFlyoutOpen(false);
  };

  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['sessions'],
    queryFn: ({ pageParam = 0 }) =>
      sessionsApi.listSessions({ skip: pageParam, limit: SESSIONS_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < SESSIONS_PAGE_SIZE) {
        return undefined;
      }
      return allPages.length * SESSIONS_PAGE_SIZE;
    },
    enabled: isAuthenticated,
  });

  const sessions = useMemo(
    () => sessionsData?.pages.flatMap((page) => page) ?? [],
    [sessionsData]
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (sessionsSearchQuery.trim()) {
        const q = sessionsSearchQuery.toLowerCase();
        const titleMatch = s.title.toLowerCase().includes(q);
        const summaryMatch = (s.session_summary || '').toLowerCase().includes(q);
        const sourceMatch = (s.sources || []).some((src: SourceSummary) =>
          (src.title || '').toLowerCase().includes(q) ||
          (src.canonical_uri || '').toLowerCase().includes(q)
        );
        return titleMatch || summaryMatch || sourceMatch;
      }
      return true;
    });
  }, [sessions, sessionsSearchQuery]);

  // Global shortcuts. No dependency array: the handlers it calls are recreated each render,
  // so re-binding every render keeps them fresh (cheap — one listener).
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isInput =
        document.activeElement?.tagName?.toLowerCase() === 'input' ||
        document.activeElement?.tagName?.toLowerCase() === 'textarea';

      // ⌘K or ⌘B: Toggle Floating Raycast Mission Palette
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        toggleSessionsFlyout();
        return;
      }

      // ⌘T or ⌘N: New Investigation / Switch to Explore
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'n')) {
        if (!isInput) {
          e.preventDefault();
          handleNewChat();
          return;
        }
      }

      // ⌘1: Switch to Explore Studio
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        if (!isInput) {
          e.preventDefault();
          switchToExplore();
          return;
        }
      }

      // ⌘2–4: Open the workspace (UnifiedWorkspace picks the matching view once it is open)
      if ((e.metaKey || e.ctrlKey) && ['2', '3', '4'].includes(e.key) && !isInput && !isWorkspaceOpen) {
        e.preventDefault();
        openWorkspace();
        return;
      }

      // Arrow navigation & Enter inside Raycast Palette
      if (isSessionsFlyoutOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSessionIndex((prev) => Math.min(prev + 1, Math.max(filteredSessions.length - 1, 0)));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSessionIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          const target = filteredSessions[selectedSessionIndex];
          if (target) {
            e.preventDefault();
            openSessionTab({ id: target.id, title: target.title });
            return;
          }
        }
      }

      // Esc: Close Raycast Palette if open
      if (e.key === 'Escape') {
        if (isSessionsFlyoutOpen) {
          e.preventDefault();
          setIsSessionsFlyoutOpen(false);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 70 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  useEffect(() => {
    const sentinel = sidebarSentinelRef.current;
    const container = sidebarScrollRef.current;
    if (!sentinel || !container || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: container, rootMargin: '50px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative w-screen h-screen max-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text-primary)] flex flex-col transition-colors">
        {/* ── 1. TOP BAR (same anatomy as the workspace's) ── */}
        {/* Signed out, home shows only the pill nav; the gallery keeps the bar so there is a way back */}
        {!isWorkspaceOpen && (isAuthenticated || showSessionsGallery) && (
        <header className="font-ui relative z-40 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[var(--ws-ink)] sm:gap-3 sm:px-4">
          {/* Equal-width side columns keep the view tabs at the true centre of the bar */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleNewChat}
            aria-label="Scout home"
            title="New research (Ctrl/⌘ N)"
            className="ui-press flex h-9 shrink-0 items-center gap-2 rounded-[9px] pr-1 cursor-pointer"
          >
            <span className="font-arcade text-[19px] font-bold leading-none tracking-wider">SCOUT</span>
            <span className="hidden items-center gap-[3px] sm:flex" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-3.5 w-[5px] -skew-x-[18deg] rounded-[1px] bg-[var(--ws-accent)]" style={{ opacity: 1 - i * 0.22 }} />
              ))}
            </span>
          </button>

          {activeSessionId && !showSessionsGallery && (
            <div className="hidden h-9 min-w-0 max-w-[220px] items-center gap-2 rounded-[12px] border border-[var(--ws-line)] pl-3 pr-1 text-[13px] md:flex">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ws-accent)]" aria-hidden />
              <span className="truncate font-medium">
                {formatSessionTitle(sessions.find((s) => s.id === activeSessionId)?.title || 'Research session')}
              </span>
              <button
                type="button"
                onClick={switchToExplore}
                aria-label="Close this session"
                title="Close session (Esc / ⌘1)"
                className="ui-press grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          )}
          </div>

          <div className="flex justify-center">
            <div role="tablist" aria-label="Scout view" className="grid grid-cols-3 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] p-0.5">
              {[
                { id: 'explore', label: 'Explore', icon: Home, title: 'Explore (Ctrl/⌘ 1)', active: !showSessionsGallery, onClick: switchToExplore },
                { id: 'sessions', label: 'Sessions', icon: LayoutGrid, title: 'All sessions', active: showSessionsGallery, onClick: openSessionsGallery },
                { id: 'workspace', label: 'Workspace', icon: Network, title: 'Workspace (Ctrl/⌘ 2)', active: false, onClick: openWorkspace },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={tab.active}
                    onClick={tab.onClick}
                    title={tab.title}
                    className={cn(
                      'ui-press flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium sm:px-3.5 cursor-pointer',
                      tab.active
                        ? 'bg-[var(--ws-dock)] text-[var(--ws-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-[var(--ws-line)]'
                        : 'text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)]'
                    )}
                  >
                    <Icon size={15} className={tab.active ? 'text-[var(--ws-accent-ink)]' : undefined} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleSessionsFlyout}
            aria-label="Search sessions"
            aria-expanded={isSessionsFlyoutOpen}
            className="ui-press hidden h-9 w-56 shrink-0 items-center gap-2 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-3 text-[13px] text-[var(--ws-ink-faint)] hover:border-[var(--ws-line-strong)] xl:flex cursor-pointer"
          >
            <Search size={15} />
            Search sessions
            <kbd className="ml-auto rounded-[6px] border border-[var(--ws-line)] px-1.5 font-mono text-[11px]">⌘K</kbd>
          </button>
          <HeaderIconButton label="Search sessions (Ctrl/⌘ K)" onClick={toggleSessionsFlyout} className="xl:hidden">
            <Search size={16} />
          </HeaderIconButton>

          <HeaderIconButton label="New research (Ctrl/⌘ N)" onClick={handleNewChat}>
            <Plus size={17} />
          </HeaderIconButton>

          <div className="hidden items-center gap-0.5 sm:flex">
            <HeaderIconButton label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </HeaderIconButton>
          </div>

          {/* Signed out, logging in happens in the auth card in the bottom right corner */}
          {isAuthenticated && (
            <LogoutConfirmPopover user={user} onLogout={logout} side="bottom" align="end" sideOffset={10}>
              <button
                type="button"
                aria-label="Account"
                className="ui-press grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[var(--ws-accent-wash)] text-[13px] font-semibold text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30 cursor-pointer"
              >
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </button>
            </LogoutConfirmPopover>
          )}
          </div>
        </header>
        )}

        {/* ── 2. SESSIONS PALETTE (⌘K) ── */}
        {isSessionsFlyoutOpen && (
          <>
            <div
              className="fixed inset-0 z-50 bg-[var(--ws-scrim)] backdrop-blur-[2px] animate-in fade-in duration-150"
              onClick={() => setIsSessionsFlyoutOpen(false)}
              aria-hidden
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search sessions"
              className="font-ui fixed left-1/2 top-[10vh] z-50 flex max-h-[76vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-dock)] text-[var(--ws-ink)] shadow-[var(--ws-shadow)] animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Search */}
              <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--ws-line)] pl-4 pr-2">
                <Search size={17} className="shrink-0 text-[var(--ws-ink-faint)]" />
                <input
                  type="text"
                  autoFocus
                  value={sessionsSearchQuery}
                  onChange={(e) => setSessionsSearchQuery(e.target.value)}
                  placeholder="Search sessions by title or summary"
                  aria-label="Search sessions"
                  className="min-w-0 flex-1 bg-transparent text-base text-[var(--ws-ink)] outline-none placeholder:text-[var(--ws-ink-faint)] sm:text-[15px]"
                />
                {sessionsSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSessionsSearchQuery('')}
                    className="ui-press h-7 shrink-0 rounded-[8px] px-2 text-[12.5px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <HeaderIconButton label="Close (Esc)" onClick={() => setIsSessionsFlyoutOpen(false)}>
                  <X size={16} />
                </HeaderIconButton>
              </div>

              {/* Results */}
              <div
                ref={sidebarScrollRef}
                onScroll={handleSidebarScroll}
                className="min-h-0 flex-1 overflow-y-auto p-2 sidebar-scroll"
              >
                {!isAuthenticated ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[14px] font-semibold">Sign in to keep your research</p>
                    <p className="mx-auto mt-1 max-w-[38ch] text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">
                      Your sessions, with their sources and answers, are listed here once you sign in.
                    </p>
                    <button
                      type="button"
                      onClick={openAuthDialog}
                      className="ui-press mt-4 h-9 rounded-[12px] bg-[var(--ws-accent)] px-4 text-[13px] font-semibold text-white hover:brightness-110 cursor-pointer"
                    >
                      Log in
                    </button>
                  </div>
                ) : isLoadingSessions ? (
                  <div className="flex flex-col gap-1" aria-label="Loading sessions">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex animate-pulse items-center gap-3 rounded-[10px] px-3 py-2.5">
                        <div className="h-8 w-8 shrink-0 rounded-[9px] bg-[var(--ws-card-hover)]" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3 w-3/5 rounded bg-[var(--ws-card-hover)]" />
                          <div className="h-2.5 w-1/4 rounded bg-[var(--ws-card-hover)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[14px] font-semibold">
                      {sessionsSearchQuery ? `No sessions match “${sessionsSearchQuery}”` : 'No sessions yet'}
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--ws-ink-soft)]">
                      {sessionsSearchQuery ? 'Try another word from the title or summary.' : 'Ask a question on the Explore page to start one.'}
                    </p>
                    <button
                      type="button"
                      onClick={sessionsSearchQuery ? () => setSessionsSearchQuery('') : handleNewChat}
                      className="ui-press mt-4 h-9 rounded-[12px] border border-[var(--ws-line)] px-4 text-[13px] font-medium hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
                    >
                      {sessionsSearchQuery ? 'Clear search' : 'New research'}
                    </button>
                  </div>
                ) : (
                  <div role="listbox" aria-label="Sessions" className="flex flex-col gap-0.5">
                    {filteredSessions.map((session, idx) => {
                      const isSelected = selectedSessionIndex === idx;
                      const isActive = activeSessionId === session.id;
                      const firstSource = session.sources?.[0];
                      const kind = firstSource ? getSessionSourceKind(firstSource) : null;
                      const KindIcon = kind ? KIND_ICON[kind] : null;

                      return (
                        <div
                          key={session.id}
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setSelectedSessionIndex(idx)}
                          onClick={() => openSessionTab({ id: session.id, title: session.title })}
                          style={staggerDelay(idx % SESSIONS_PAGE_SIZE)}
                          className={cn(
                            'ui-in-up group flex items-center gap-3 rounded-[10px] px-3 py-2.5 cursor-pointer select-none',
                            isSelected ? 'bg-[var(--ws-card-hover)]' : 'hover:bg-[var(--ws-card-hover)]'
                          )}
                        >
                          <span
                            className={cn(
                              'grid h-8 w-8 shrink-0 place-items-center rounded-[9px]',
                              isActive ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30' : 'bg-[var(--ws-canvas)] text-[var(--ws-ink-faint)] ring-1 ring-[var(--ws-line)]'
                            )}
                          >
                            <MessageSquare size={14} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium" title={formatSessionTitle(session.title)}>
                              {formatSessionTitle(session.title)}
                            </p>
                            <p className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--ws-ink-faint)]">
                              <span className="shrink-0">{formatRelativeTime(session.last_activity_at || session.created_at)}</span>
                              {KindIcon && kind && (
                                <span className="flex min-w-0 items-center gap-1" title={firstSource?.title || firstSource?.canonical_uri || undefined}>
                                  <KindIcon size={12} className="shrink-0" style={{ color: kindColor(kind, isLight) }} />
                                  <span className="truncate">
                                    {session.sources!.length === 1 ? '1 source' : `${session.sources!.length} sources`}
                                  </span>
                                </span>
                              )}
                              {isActive && <span className="shrink-0 text-[var(--ws-accent-ink)]">Open now</span>}
                            </p>
                          </div>
                          {isSelected && (
                            <kbd className="hidden shrink-0 rounded-[6px] border border-[var(--ws-line)] px-1.5 font-mono text-[11px] text-[var(--ws-ink-faint)] sm:inline">↵</kbd>
                          )}
                          <DeleteSessionPopover
                            session={session}
                            side="right"
                            align="center"
                            sideOffset={8}
                            onSuccess={() => {
                              closeTab(session.id);
                              queryClient.invalidateQueries({ queryKey: ['sessions'] });
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Delete ${formatSessionTitle(session.title)}`}
                              title="Delete session"
                              className="ui-press grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] opacity-100 hover:bg-[var(--ws-card)] hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </DeleteSessionPopover>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div ref={sidebarSentinelRef} className="h-1 w-full pointer-events-none" />

                {isFetchingNextPage && (
                  <div className="flex items-center justify-center gap-1.5 py-2 text-[12px] text-[var(--ws-ink-faint)]">
                    <Loader2 size={12} className="animate-spin" />
                    Loading older sessions
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-[var(--ws-line)] px-4 text-[12px] text-[var(--ws-ink-faint)]">
                <div className="hidden items-center gap-3 sm:flex">
                  {[['↵', 'Open'], ['↑↓', 'Move'], ['Esc', 'Close']].map(([key, label]) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <kbd className="rounded-[6px] border border-[var(--ws-line)] px-1.5 font-mono text-[11px]">{key}</kbd>
                      {label}
                    </span>
                  ))}
                </div>
                <span className="sm:hidden">
                  {filteredSessions.length === 1 ? '1 session' : `${filteredSessions.length} sessions`}
                </span>
                <button
                  type="button"
                  onClick={openSessionsGallery}
                  className="ui-press flex h-8 items-center gap-1.5 rounded-[9px] px-2 font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                >
                  <LayoutGrid size={14} />
                  See all sessions
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── 3. HOME / SESSIONS GALLERY / WORKSPACE ── */}
        <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]">
          {showSessionsGallery ? (
            <div className="w-full h-full flex flex-col">
              <LandingSessionsWindow
                onSelectSession={(sessionId) => {
                  const s = sessions.find((x) => x.id === sessionId);
                  openSessionTab({
                    id: sessionId,
                    title: s?.title || 'Research Session',
                  });
                }}
                onNewChat={handleNewChat}
              />
            </div>
          ) : isWorkspaceOpen || (activeSessionId && activeTabId !== 'explore') ? (
            /* ── SOURCES + KNOWLEDGE MAP + COPILOT WORKSPACE ── */
            <div className="relative z-10 h-full w-full">
              <UnifiedWorkspace
                sessionId={activeSessionId}
                initialPrompt={initialChatPrompt}
                sessions={sessions}
                onOpenSession={(s) => openSessionTab(s)}
                onNewConversation={startWorkspaceConversation}
                onSessionDeleted={() => {
                  if (activeSessionId) closeTab(activeSessionId);
                  queryClient.invalidateQueries({ queryKey: ['sessions'] });
                }}
                onExit={switchToExplore}
                onOpenSearch={toggleSessionsFlyout}
                onOpenGallery={() => {
                  setShowSessionsGallery(true);
                  setIsWorkspaceOpen(false);
                }}
              />
            </div>
          ) : (
            /* ── HOME: the question box for signed-in users, the product pitch for visitors ── */
              <div className="font-ui relative flex h-full w-full flex-col overflow-hidden bg-[var(--ws-canvas)] text-[var(--ws-ink)]">
                {/* Abstract backdrop, toned by a scrim so the text stays readable */}
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                  <img
                    src={isLight ? homeBackgroundLight : homeBackgroundDark}
                    alt=""
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                  <div className="home-bg-scrim absolute inset-0" />
                </div>
              {isAuthenticated ? (
                <HomeComposer key={composerKey} onSessionCreated={openSessionTab} />
              ) : (
              /* One scroll area: the pill nav, then the pitch at full height */
              <div className="relative flex h-full w-full flex-col overflow-y-auto sidebar-scroll">
                {/* Starting means logging in first */}
                <MarketingNav onStart={openAuthDialog} />
                {/* flex-1, not min-h-full: fills the space under the nav instead of adding the nav's height on top */}
                <div id="home" className="flex flex-1 shrink-0 scroll-mt-20 flex-col px-4 sm:px-6">
                {/* One hero, top down: the promise, the source types, then a worked example of a cited answer */}
                <main className="mx-auto flex w-full max-w-[1120px] flex-col pb-8 pt-4 sm:pt-6">
                  <div className="flex flex-col items-center text-center">
                    {/* Teal title; the second line is faded so the promise reads first */}
                    <h1 className="ui-in-up text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--ws-accent-ink)] sm:text-[56px]">
                      Drop your future
                      <br />
                      <span className="opacity-60">Knowledge.</span>
                    </h1>
                    <p className="ui-in-up mt-2.5 max-w-[68ch] text-[15px] leading-relaxed text-[var(--ws-ink-soft)]" style={introDelay(90)}>
                      Scout reads the YouTube videos, PDFs, GitHub repos and web pages you give it, then answers your questions with a citation on every claim. Built for students, researchers and engineers who need to know where a fact came from.
                    </p>
                    <div className="ui-in-up mk-scope mt-5" style={introDelay(135)}>
                      <SourceTypesRow className="justify-center" />
                    </div>
                  </div>

                  <ArcadeRateLimitBanner className="mt-6 w-full" />

                  <div className="mk-scope mt-10 sm:mt-12">
                    <SourceMapDiagram />
                    <p className="mt-4 text-xs text-[var(--mk-ink-faint)]">
                      Hover or focus a citation to see which source it came from.
                    </p>
                  </div>

                </main>
                </div>
              </div>
              )}
              </div>
          )}
        </div>

      </div>
    </TooltipProvider>
  );
}