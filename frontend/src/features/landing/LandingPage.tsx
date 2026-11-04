import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, X, MessageSquare, Trash2, Loader2, Search } from '@/components/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import UnifiedWorkspace from '@/features/workspace/UnifiedWorkspace';
import { useSessionsList } from '@/features/workspace/useSessionsList';
import { useAuth } from '@/features/auth/useAuth';
import { formatSessionTitle, formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { introDelay, staggerDelay } from '@/lib/motion';
import { useTheme } from '@/features/theme';
import { KIND_ICON } from '@/features/workspace/canvas/addSourceOptions';
import { kindColor, type SourceKind } from '@/features/workspace/sourceMeta';
import HomeBackdrop from '@/features/landing/HomeBackdrop';
import { openAuthDialog } from '@/features/auth/authEvents';
import MarketingNav from '@/features/marketing/MarketingNav';
import { IconButton } from '@/features/workspace/FloatingBar';
import SourceTypesRow from '@/features/marketing/SourceTypesRow';
import SourceMapDiagram from '@/features/marketing/SourceMapDiagram';

// Same page size as useSessionsList, so each page of older sessions staggers in from its own first row
const SESSIONS_PAGE_SIZE = 20;

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

/**
 * `/` and `/sessions/:sessionId`. Signed in, the research home: sessions, knowledge map, sources and copilot on one
 * screen (UnifiedWorkspace), with the session in the URL open. Signed out, the product pitch. The ⌘K sessions palette
 * works over both.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const sessionsList = useSessionsList(isAuthenticated);
  const { sessions, isLoading: isLoadingSessions, hasNextPage, isFetchingNextPage, fetchNextPage } = sessionsList;
  const activeSessionId = routeSessionId ?? null;

  const [isSessionsFlyoutOpen, setIsSessionsFlyoutOpen] = useState<boolean>(false);
  const [sessionsSearchQuery, setSessionsSearchQuery] = useState<string>('');
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarSentinelRef = useRef<HTMLDivElement>(null);

  // Reset the palette highlight whenever the query or open state changes.
  const paletteKey = JSON.stringify([sessionsSearchQuery, isSessionsFlyoutOpen]);
  const [lastPaletteKey, setLastPaletteKey] = useState(paletteKey);
  if (paletteKey !== lastPaletteKey) {
    setLastPaletteKey(paletteKey);
    setSelectedSessionIndex(0);
  }

  const openSession = (session: { id: string; title: string }) => {
    setIsSessionsFlyoutOpen(false);
    navigate(`/sessions/${session.id}`);
  };

  // A new conversation has no session yet; the copilot creates one with the first message
  const newResearch = () => {
    setIsSessionsFlyoutOpen(false);
    if (window.location.pathname !== '/') navigate('/');
  };

  const handleSessionDeleted = (sessionId: string) => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    if (sessionId === activeSessionId) navigate('/');
  };

  const toggleSessionsFlyout = () => {
    setIsSessionsFlyoutOpen((prev) => !prev);
  };

  const filteredSessions = useMemo(() => {
    const q = sessionsSearchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      (s.session_summary || '').toLowerCase().includes(q) ||
      (s.sources || []).some((src: SourceSummary) =>
        (src.title || '').toLowerCase().includes(q) || (src.canonical_uri || '').toLowerCase().includes(q)
      )
    );
  }, [sessions, sessionsSearchQuery]);

  // Global shortcuts. No dependency array: the handlers it calls are recreated each render,
  // so re-binding every render keeps them fresh (cheap, one listener).
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';

      // ⌘K or ⌘B: sessions palette
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        toggleSessionsFlyout();
        return;
      }

      // ⌘N or ⌘T: new research
      if (isAuthenticated && (e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'n') && !isInput) {
        e.preventDefault();
        newResearch();
        return;
      }

      if (!isSessionsFlyoutOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSessionIndex((prev) => Math.min(prev + 1, Math.max(filteredSessions.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSessionIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        const target = filteredSessions[selectedSessionIndex];
        if (target) {
          e.preventDefault();
          openSession({ id: target.id, title: target.title });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsSessionsFlyoutOpen(false);
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

        {/* ── Sessions palette (⌘K) ── */}
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
              className="font-ui fixed left-1/2 top-[10vh] z-50 flex max-h-[76vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-dock)] text-[var(--ws-ink)] shadow-[var(--ws-shadow)] animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Search */}
              <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--ws-line)] pl-4 pr-2">
                <Search size={17} className="shrink-0 text-[var(--ws-ink-faint)]" />
                <input
                  type="text"
                  autoFocus
                  value={sessionsSearchQuery}
                  onChange={(e) => setSessionsSearchQuery(e.target.value)}
                  placeholder="Search sessions"
                  aria-label="Search sessions"
                  className="min-w-0 flex-1 bg-transparent text-base text-[var(--ws-ink)] outline-none placeholder:text-[var(--ws-ink-faint)] sm:text-[15px]"
                />
                <IconButton label="Close (Esc)" onClick={() => setIsSessionsFlyoutOpen(false)}>
                  <X size={16} />
                </IconButton>
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
                    <button
                      type="button"
                      onClick={openAuthDialog}
                      className="ui-press mt-4 h-9 rounded-full bg-[var(--ws-accent)] px-4 text-[13px] font-semibold text-[var(--ws-on-accent)] hover:brightness-110 cursor-pointer"
                    >
                      Log in
                    </button>
                  </div>
                ) : isLoadingSessions ? (
                  <div className="flex flex-col gap-1" aria-label="Loading sessions">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex animate-pulse items-center gap-3 rounded-full px-3 py-2.5">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--ws-card-hover)]" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3 w-3/5 rounded-full bg-[var(--ws-card-hover)]" />
                          <div className="h-2.5 w-1/4 rounded-full bg-[var(--ws-card-hover)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[14px] font-semibold">
                      {sessionsSearchQuery ? `No sessions match “${sessionsSearchQuery}”` : 'No sessions yet'}
                    </p>
                    <button
                      type="button"
                      onClick={sessionsSearchQuery ? () => setSessionsSearchQuery('') : newResearch}
                      className="ui-press mt-4 h-9 rounded-full border border-[var(--ws-line)] px-4 text-[13px] font-medium hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
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
                          onClick={() => openSession({ id: session.id, title: session.title })}
                          style={staggerDelay(idx % SESSIONS_PAGE_SIZE)}
                          className={cn(
                            'ui-in-up group flex items-center gap-3 rounded-full px-3 py-2.5 cursor-pointer select-none',
                            isSelected ? 'bg-[var(--ws-card-hover)]' : 'hover:bg-[var(--ws-card-hover)]'
                          )}
                        >
                          <span
                            className={cn(
                              'grid h-8 w-8 shrink-0 place-items-center rounded-full',
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
                            </p>
                          </div>
                          {isSelected && (
                            <kbd className="hidden shrink-0 rounded-full border border-[var(--ws-line)] px-1.5 font-mono text-[11px] text-[var(--ws-ink-faint)] sm:inline">↵</kbd>
                          )}
                          <DeleteSessionPopover
                            session={session}
                            side="right"
                            align="center"
                            sideOffset={8}
                            onSuccess={() => handleSessionDeleted(session.id)}
                          >
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Delete ${formatSessionTitle(session.title)}`}
                              title="Delete session"
                              className="ui-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] opacity-100 hover:bg-[var(--ws-card)] hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
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
              <div className="flex h-11 shrink-0 items-center justify-end border-t border-[var(--ws-line)] px-2 text-[12px]">
                <button
                  type="button"
                  onClick={newResearch}
                  className="ui-press flex h-8 items-center gap-1.5 rounded-full px-2 font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                >
                  <Plus size={14} />
                  New research
                </button>
              </div>
            </div>
          </>
        )}

        {isAuthenticated ? (
          <UnifiedWorkspace
            sessionId={activeSessionId}
            sessionsList={sessionsList}
            onOpenSession={openSession}
            onNewConversation={newResearch}
            onSessionDeleted={handleSessionDeleted}
            onOpenSearch={toggleSessionsFlyout}
          />
        ) : (
          /* ── The product pitch for visitors ── */
          <div className="font-ui relative flex h-full w-full flex-col overflow-hidden bg-[var(--ws-canvas)] text-[var(--ws-ink)]">
            <HomeBackdrop />
            {/* Starting means logging in first. The header floats over the page, where the workspace's does */}
            <MarketingNav onStart={openAuthDialog} />
              <div className="relative flex h-full w-full flex-col overflow-y-auto sidebar-scroll">
                {/* Top padding clears the floating header (12px inset + 48px bar) */}
                <div id="home" className="flex flex-1 shrink-0 flex-col px-4 pt-[76px] sm:px-6">
                {/* One hero, top down: the promise, the source types, then a worked example of a cited answer */}
                <main className="mx-auto flex w-full max-w-[1120px] flex-col pb-8 pt-4 sm:pt-6">
                  <div className="flex flex-col items-center text-center">
                    {/* Same pattern as the map's drop heading once signed in: the action, then a faded second line */}
                    <h1 className="ui-in-up text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-[var(--ws-accent-ink)] sm:text-[56px]">
                      Drop your favourite
                      <br />
                      <span className="opacity-60">Knowledge.</span>
                    </h1>
                    <div className="ui-in-up mt-6" style={introDelay(90)}>
                      <SourceTypesRow className="justify-center" />
                    </div>
                  </div>

                  <div className="mt-10 sm:mt-12">
                    <SourceMapDiagram />
                  </div>

                </main>
                </div>
              </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
