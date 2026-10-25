import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  ArrowUp,
  X,
  Network,
  LogIn,
  MessageSquare,
  Trash2,
  Loader2,
  Check,
  RotateCw,
  Search,
  Volume2,
  VolumeX,
} from '@/components/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { sessionsApi } from '@/api/sessions';
import { sourcesApi } from '@/api/sources';
import { knowledgeApi } from '@/api/knowledge';
import { soundEffects, useSoundEffects } from '@/lib/soundEffects';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import LogoutConfirmPopover from '@/features/auth/LogoutConfirmPopover';
import LandingSessionsWindow from '@/features/landing/LandingSessionsWindow';
import UnifiedWorkspace from '@/features/workspace/UnifiedWorkspace';
import { useAuth } from '@/features/auth/useAuth';
import {
  normalizeSourceTitle,
  formatSessionTitle,
  deriveInitialSessionTitle,
  formatRelativeTime,
} from '@/lib/formatters';
import DropZone from '@/components/workspace/DropZone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { Home, LayoutGrid, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/features/theme';
import { KIND_ICON } from '@/features/workspace/canvas/addSourceOptions';
import { kindColor, type SourceKind } from '@/features/workspace/sourceMeta';
import homeBackgroundDark from '@/assets/backgrounds/teal-curves-dark.jpg';
import homeBackgroundLight from '@/assets/backgrounds/teal-waves-light.jpg';
import { useRateLimit, rateLimitManager } from '@/lib/rateLimitManager';
import { getHttpStatus, getServerErrorMessage } from '@/lib/apiError';

type SourceType = 'youtube' | 'pdf' | 'github' | 'docs' | 'web';
export type SourceIngestStatus = 'extracting' | 'embedding' | 'ready' | 'failed';

interface AttachedSource {
  id: string;
  backendSourceId?: string;
  type: SourceType;
  title: string;
  urlOrName: string;
  status: SourceIngestStatus;
  chunkCount?: number;
  error?: string;
}

export interface HorizonTab {
  id: string;
  title: string;
}

const SESSIONS_PAGE_SIZE = 20;

// Home backdrops: both photos are by Pawel Czerwinski, free under the Unsplash License
// (unsplash.com/photos/H8kzolaZjIM for dark, unsplash.com/photos/kj8_P9d5tpo for light).
const UNSPLASH_CREDIT = {
  author: 'Pawel Czerwinski',
  authorUrl: 'https://unsplash.com/@pawel_czerwinski?utm_source=scout&utm_medium=referral',
  siteUrl: 'https://unsplash.com/?utm_source=scout&utm_medium=referral',
};

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
        'grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer',
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
  const { soundEnabled, toggleSound } = useSoundEffects();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const isIngestRateLimited = isScopeRateLimited('sources:ingest');
  const ingestCooldownSec = getScopeSecondsLeft('sources:ingest');
  const prevIndexingRef = useRef<boolean>(false);

  const [prompt, setPrompt] = useState<string>('');
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarSentinelRef = useRef<HTMLDivElement>(null);

  const handleSelectSuggestedPrompt = (suggestedText: string) => {
    setPrompt(suggestedText);
    if (promptInputRef.current) {
      promptInputRef.current.focus();
      setTimeout(() => {
        if (promptInputRef.current) {
          promptInputRef.current.style.height = 'auto';
          promptInputRef.current.style.height = `${Math.min(promptInputRef.current.scrollHeight, 240)}px`;
        }
      }, 0);
    }
  };

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
    setPrompt('');
    setAttachedSources([]);
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
    soundEffects.playNavClick();
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

  const {
    data: curiosityData,
    refetch: refetchCuriosity,
    isFetching: isFetchingCuriosity,
  } = useQuery({
    queryKey: ['curiosity'],
    queryFn: () => knowledgeApi.getCuriosity(),
    enabled: isAuthenticated,
    staleTime: 45 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [curiosityProgress, setCuriosityProgress] = useState<number>(0);

  const refreshCuriosityMutation = useMutation({
    mutationFn: () => knowledgeApi.getCuriosity(true),
    onSuccess: (freshData) => {
      queryClient.setQueryData(['curiosity'], freshData);
      soundEffects.playEmbeddingComplete();
    },
    onError: (err) => {
      console.error('Failed to refresh curiosity prompts:', err);
      refetchCuriosity();
    },
  });

  const isCuriosityLoading = isFetchingCuriosity || refreshCuriosityMutation.isPending;

  // Jump the bar on loading edges (start -> 10%, finish -> 100% if it was showing) during render.
  const [wasCuriosityLoading, setWasCuriosityLoading] = useState(false);
  if (wasCuriosityLoading !== isCuriosityLoading) {
    setWasCuriosityLoading(isCuriosityLoading);
    setCuriosityProgress((prev) => (isCuriosityLoading ? 10 : prev > 0 ? 100 : 0));
  }

  useEffect(() => {
    if (!isCuriosityLoading) {
      const t = setTimeout(() => setCuriosityProgress(0), 700);
      return () => clearTimeout(t);
    }

    const target = 92;
    // Over ~6-7 seconds response time: progressive increments with natural deceleration
    const interval = setInterval(() => {
      setCuriosityProgress((prev) => {
        if (prev < target) {
          const step = Math.max(0.6, (target - prev) * 0.045);
          return Math.min(target, prev + step);
        }
        return prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isCuriosityLoading]);

  const hasMemoryPrompts = Boolean(isAuthenticated && curiosityData?.suggested_prompts && curiosityData.suggested_prompts.length > 0);
  const promptSuggestions = hasMemoryPrompts
    ? curiosityData!.suggested_prompts
    : [
      'Synthesize recent breakthroughs in Graph RAG',
      'Compare dense retrieval vs hybrid search',
      'Analyze multi-agent reasoning workflows',
    ];


  const inferSourceType = (rawType: SourceType, urlOrContent: string): SourceType => {
    const u = urlOrContent.toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('github.com')) return 'github';
    if (u.endsWith('.pdf')) return 'pdf';
    return rawType;
  };

  const mapToBackendSourceType = (rawType: SourceType, urlOrContent: string): string => {
    const u = (urlOrContent || '').toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('github.com')) return 'github';
    if (u.endsWith('.pdf')) return 'pdf';
    if (u.endsWith('.md')) return 'markdown';
    if (u.endsWith('.txt')) return 'txt';
    if (u.endsWith('.docx') || u.endsWith('.doc')) return 'docx';
    if (rawType === 'pdf') return 'pdf';
    if (rawType === 'youtube') return 'youtube';
    if (rawType === 'github') return 'github';
    // 'docs', 'web', or generic URLs map to 'website'
    return 'website';
  };

  const ingestSourceItem = async (
    clientSourceId: string,
    type: SourceType,
    title: string,
    urlOrName: string,
    content?: string
  ) => {
    // Transition to embedding phase after brief extraction preview so the user clearly sees progress
    const timer = setTimeout(() => {
      setAttachedSources((prev) =>
        prev.map((s) => (s.id === clientSourceId && s.status === 'extracting' ? { ...s, status: 'embedding' } : s))
      );
    }, 1400);

    try {
      const backendSourceType = mapToBackendSourceType(type, urlOrName);
      const created = await sourcesApi.createSource({
        url: urlOrName.startsWith('http') ? urlOrName : undefined,
        title,
        content: content || (!urlOrName.startsWith('http') ? urlOrName : undefined),
        source_type: backendSourceType,
      });

      clearTimeout(timer);

      if (created?.status === 'indexed') {
        soundEffects.playEmbeddingComplete();
        const count = created.chunk_count || (created.metadata?.chunk_count) || 1;
        setAttachedSources((prev) =>
          prev.map((s) =>
            s.id === clientSourceId
              ? {
                ...s,
                status: 'ready',
                backendSourceId: created.id,
                title: created.title || s.title,
                chunkCount: count,
              }
              : s
          )
        );
        queryClient.invalidateQueries({ queryKey: ['sources'] });
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
      } else if (created?.status === 'failed') {
        setAttachedSources((prev) =>
          prev.map((s) =>
            s.id === clientSourceId
              ? {
                ...s,
                status: 'failed',
                error: created.metadata?.error || 'Extraction or vector embedding generation failed',
              }
              : s
          )
        );
      } else {
        soundEffects.playEmbeddingComplete();
        setAttachedSources((prev) =>
          prev.map((s) =>
            s.id === clientSourceId
              ? {
                ...s,
                status: 'ready',
                backendSourceId: created.id,
                title: created.title || s.title,
                chunkCount: created.chunk_count || 1,
              }
              : s
          )
        );
      }
    } catch (err) {
      clearTimeout(timer);
      console.error('Source ingestion failed:', err);
      const is429 = getHttpStatus(err) === 429;
      if (is429) {
        rateLimitManager.notify(err);
      }
      const errorMsg = is429
        ? 'Rate limit cooldown active (10 sources/min max)'
        : getServerErrorMessage(err) || (err instanceof Error && err.message) || 'Ingestion failed';
      setAttachedSources((prev) =>
        prev.map((s) =>
          s.id === clientSourceId
            ? {
              ...s,
              status: 'failed',
              error: errorMsg,
            }
            : s
        )
      );
    }
  };

  const handleAddSource = (type: SourceType, title: string, urlOrName: string, content?: string) => {
    soundEffects.playSourceDrop();
    const finalType = inferSourceType(type, urlOrName);
    const displayTitle = normalizeSourceTitle(title, urlOrName);
    const clientSourceId = Math.random().toString(36).substring(2, 9);

    const newSource: AttachedSource = {
      id: clientSourceId,
      type: finalType,
      title: displayTitle,
      urlOrName,
      status: isAuthenticated ? 'extracting' : 'ready',
      chunkCount: undefined,
    };

    setAttachedSources((prev) => [...prev, newSource]);
    setSourceModalType(null);
    setSourceInputVal('');

    if (isAuthenticated) {
      ingestSourceItem(clientSourceId, finalType, displayTitle, urlOrName, content);
    }
  };

  const handleRetrySource = (id: string) => {
    if (isIngestRateLimited) {
      soundEffects.playRateLimitWarning();
      return;
    }
    const target = attachedSources.find((s) => s.id === id);
    if (!target) return;
    setAttachedSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'extracting', error: undefined } : s))
    );
    ingestSourceItem(id, target.type, target.title, target.urlOrName);
  };

  const handleRemoveSource = (id: string) => {
    soundEffects.playChipRemove();
    setAttachedSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (
        file.name.endsWith('.txt') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.csv')
      ) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target?.result as string;
          handleAddSource('docs', file.name, file.name, text);
        };
        reader.readAsText(file);
      } else {
        handleAddSource('pdf', file.name, file.name);
      }
    }
    e.target.value = '';
  };

  const isAnySourceExtracting = attachedSources.some((s) => s.status === 'extracting');
  const isAnySourceEmbedding = attachedSources.some((s) => s.status === 'embedding');
  const isAnySourceIndexing = isAnySourceExtracting || isAnySourceEmbedding;

  // Smooth progressive animation for indexing / embedding
  const [indexingProgress, setIndexingProgress] = useState<number>(0);
  const allSourcesReady = attachedSources.length > 0 && attachedSources.every((s) => s.status === 'ready');

  // When indexing finishes, snap to 100% (all ready) or 0% during render; the effect handles timers.
  const [wasIndexing, setWasIndexing] = useState(false);
  if (wasIndexing !== isAnySourceIndexing) {
    setWasIndexing(isAnySourceIndexing);
    if (!isAnySourceIndexing) setIndexingProgress(allSourcesReady ? 100 : 0);
  }

  useEffect(() => {
    if (!isAnySourceIndexing) {
      if (prevIndexingRef.current && allSourcesReady) {
        soundEffects.playEmbeddingComplete();
      }
      prevIndexingRef.current = false;
      if (allSourcesReady) {
        const t = setTimeout(() => setIndexingProgress(0), 1000);
        return () => clearTimeout(t);
      }
      return;
    }

    prevIndexingRef.current = true;
    const target = isAnySourceEmbedding ? 88 : 42;
    const interval = setInterval(() => {
      setIndexingProgress((prev) => {
        if (prev < target) {
          const step = Math.max(1, Math.round((target - prev) / 6));
          return Math.min(target, prev + step);
        }
        return prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isAnySourceIndexing, isAnySourceEmbedding, allSourcesReady]);

  const canSubmit =
    (prompt.trim().length > 0 || attachedSources.length > 0) &&
    !isAnySourceIndexing &&
    !isSubmitting;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit || isSubmitting || isAnySourceIndexing) return;

    if (isAuthenticated) {
      setIsSubmitting(true);
      try {
        const readySourceIds = attachedSources
          .filter((s) => s.status === 'ready' && s.backendSourceId)
          .map((s) => s.backendSourceId as string);

        const newSession = await sessionsApi.createSession({
          title: deriveInitialSessionTitle(prompt, attachedSources),
          source_policy: 'source_first',
          source_ids: readySourceIds.length > 0 ? readySourceIds : undefined,
        });

        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['sources'] });
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
        openSessionTab(
          {
            id: newSession.id,
            title: newSession.title || deriveInitialSessionTitle(prompt, attachedSources),
          },
          prompt
        );
        setPrompt('');
        setAttachedSources([]);
      } catch (err) {
        console.error('Session creation failed:', err);
        const draft = { prompt, sources: attachedSources };
        navigate('/sessions', { state: { draft } });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const draft = { prompt, sources: attachedSources };
      sessionStorage.setItem('airw_landing_draft', JSON.stringify(draft));
      navigate('/register', { state: { draft } });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isAnySourceIndexing) {
        return;
      }
      handleSubmit();
    }
  };

  // Source chips use the workspace's per-kind icons and colors
  const SOURCE_TYPE_KIND: Record<SourceType, SourceKind> = { youtube: 'youtube', pdf: 'pdf', github: 'github', docs: 'web', web: 'web' };
  const getSourceIcon = (type: SourceType) => {
    const kind = SOURCE_TYPE_KIND[type];
    const Icon = KIND_ICON[kind];
    return <Icon size={13} className="shrink-0" style={{ color: kindColor(kind, isLight) }} />;
  };

  // "Add a source" buttons in the composer; each also drafts a matching question
  const sourceStarters: Array<{ kind: SourceKind; label: string; opens: SourceType | 'file'; prompt: string }> = [
    {
      kind: 'youtube',
      label: 'YouTube',
      opens: 'youtube',
      prompt: 'Extract key insights, chapters, and fact-check arguments from this lecture video: ',
    },
    {
      kind: 'pdf',
      label: 'PDF',
      opens: 'file',
      prompt: 'Synthesize methodology and empirical conclusions from the uploaded PDF paper.',
    },
    {
      kind: 'github',
      label: 'GitHub',
      opens: 'github',
      prompt: 'Analyze repository architecture and summarize technical design tradeoffs: ',
    },
    {
      kind: 'web',
      label: 'Web page',
      opens: 'docs',
      prompt: 'Index this documentation site and explain core API patterns: ',
    },
  ];

  // Same wording as the workspace's add-source dialog (features/workspace/canvas/AddSource.tsx)
  const modalTitles: Record<string, { kind: SourceKind; title: string; desc: string; placeholder: string; cta: string }> = {
    youtube: {
      kind: 'youtube',
      title: 'Add a YouTube video',
      desc: 'Scout pulls the transcript, chunks it, and maps the concepts it mentions.',
      placeholder: 'https://www.youtube.com/watch?v=…',
      cta: 'Add video',
    },
    github: {
      kind: 'github',
      title: 'Add a GitHub repository',
      desc: 'Public repositories only. The README and docs are indexed.',
      placeholder: 'https://github.com/owner/repository',
      cta: 'Add repository',
    },
    docs: {
      kind: 'web',
      title: 'Add a web page or PDF link',
      desc: 'Articles, documentation pages and direct links to PDF papers all work.',
      placeholder: 'https://arxiv.org/pdf/1706.03762.pdf',
      cta: 'Add link',
    },
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative w-screen h-screen max-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text-primary)] flex flex-col transition-colors">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.txt,.md,.doc,.docx"
          onChange={handleFileUpload}
        />

        {/* ── 1. TOP BAR (same anatomy as the workspace's) ── */}
        {!isWorkspaceOpen && (
        <header className="font-ui relative z-40 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-[var(--ws-line)] bg-[var(--ws-dock)] px-3 text-[var(--ws-ink)] sm:gap-3 sm:px-4">
          {/* Equal-width side columns keep the view tabs at the true centre of the bar */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleNewChat}
            aria-label="Scout home"
            title="New research (Ctrl/⌘ N)"
            className="flex h-9 shrink-0 items-center gap-2 rounded-[9px] pr-1 cursor-pointer"
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
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
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
                      'flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors sm:px-3.5 cursor-pointer',
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
            className="hidden h-9 w-56 shrink-0 items-center gap-2 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-3 text-[13px] text-[var(--ws-ink-faint)] hover:border-[var(--ws-line-strong)] xl:flex cursor-pointer"
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
            <HeaderIconButton label={soundEnabled ? 'Mute sound effects' : 'Turn on sound effects'} onClick={toggleSound}>
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </HeaderIconButton>
            <HeaderIconButton label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </HeaderIconButton>
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
            <HeaderIconButton label="Log in" onClick={() => navigate('/login')}>
              <LogIn size={16} />
            </HeaderIconButton>
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
                    className="h-7 shrink-0 rounded-[8px] px-2 text-[12.5px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
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
                      onClick={() => navigate('/login')}
                      className="mt-4 h-9 rounded-[12px] bg-[var(--ws-accent)] px-4 text-[13px] font-semibold text-white hover:brightness-110 cursor-pointer"
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
                      className="mt-4 h-9 rounded-[12px] border border-[var(--ws-line)] px-4 text-[13px] font-medium hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] cursor-pointer"
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
                          className={cn(
                            'group flex items-center gap-3 rounded-[10px] px-3 py-2.5 cursor-pointer select-none',
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
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] opacity-100 hover:bg-[var(--ws-card)] hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
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
                  className="flex h-8 items-center gap-1.5 rounded-[9px] px-2 font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
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
            /* ── HOME: the empty map where research starts ── */
            <DropZone onDropSource={(content, type) => {
              if (type === 'file') handleAddSource('pdf', content, content);
              else handleAddSource('docs', content, content);
            }}>
              <div className="font-ui relative h-full w-full overflow-hidden bg-[var(--ws-canvas)] text-[var(--ws-ink)]">
                {/* Abstract backdrop, toned by a scrim so the text and composer stay readable */}
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                  <img
                    src={isLight ? homeBackgroundLight : homeBackgroundDark}
                    alt=""
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                  <div className="home-bg-scrim absolute inset-0" />
                </div>
              <div className="relative flex h-full w-full flex-col overflow-y-auto px-4 sidebar-scroll sm:px-6">
                <main className="mx-auto my-auto flex w-full max-w-[680px] flex-col py-10 sm:py-14">
                  <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
                    What do you want to understand?
                  </h1>
                  <p className="mt-2.5 max-w-[56ch] text-[15px] leading-relaxed text-[var(--ws-ink-soft)]">
                    Ask a question or add sources. Scout searches your library, knowledge map and the web, checks the evidence, and cites every claim.
                  </p>

                  <ArcadeRateLimitBanner className="mt-6 w-full" />

                  {/* Composer */}
                  <div className="relative mt-6 overflow-hidden rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-card)] shadow-[var(--ws-shadow)] transition-colors focus-within:border-[var(--ws-accent)] focus-within:ring-2 focus-within:ring-[var(--ws-accent-wash)]">
                    {isAnySourceIndexing && (
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-[var(--ws-line)]" aria-hidden>
                        <div className="ws-ease h-full bg-[var(--ws-accent)] transition-[width] duration-300" style={{ width: `${indexingProgress}%` }} />
                      </div>
                    )}

                    {/* Sources attached to this question */}
                    {attachedSources.length > 0 && (
                      <div className="border-b border-[var(--ws-line)] px-3 pb-3 pt-2.5 sm:px-4">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-medium text-[var(--ws-ink-soft)]">
                            {attachedSources.length === 1 ? '1 source' : `${attachedSources.length} sources`} for this question
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAttachedSources([]); }}
                            className="rounded-[7px] px-1.5 py-0.5 text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                          >
                            Remove all
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {attachedSources.map((source) => {
                            const isExtracting = source.status === 'extracting';
                            const isEmbedding = source.status === 'embedding';
                            const isReady = source.status === 'ready';
                            const isFailed = source.status === 'failed';

                            const tooltipMessage = isExtracting
                              ? 'Reading the text and structure of this source'
                              : isEmbedding
                                ? 'Indexing passages so answers can cite them'
                                : isReady
                                  ? `Ready: ${source.chunkCount || 1} passages indexed`
                                  : (source.error || 'Adding this source failed. Retry to try again.');

                            return (
                              <Tooltip key={source.id} delayDuration={150}>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      'relative inline-flex h-8 max-w-full items-center gap-1.5 overflow-hidden rounded-[9px] border bg-[var(--ws-canvas)] pl-2 pr-1 text-[12.5px] select-none',
                                      isFailed ? 'border-red-500/40' : 'border-[var(--ws-line)]'
                                    )}
                                  >
                                    {(isExtracting || isEmbedding) && (
                                      <span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden" aria-hidden>
                                        <span className="ws-ingest-bar block h-full w-2/5 bg-[var(--ws-ingest)]" />
                                      </span>
                                    )}
                                    {getSourceIcon(source.type)}
                                    <span className="max-w-[140px] truncate font-medium sm:max-w-[200px]" title={source.title}>
                                      {source.title}
                                    </span>
                                    {(isExtracting || isEmbedding) && (
                                      <span className="text-[11.5px] text-[var(--ws-ingest)]">{isExtracting ? 'Reading' : 'Indexing'}</span>
                                    )}
                                    {isReady && (
                                      <span className="inline-flex items-center gap-0.5 text-[11.5px] text-[var(--ws-ink-faint)] tabular-nums">
                                        <Check size={11} className="text-[var(--ws-accent-ink)]" />
                                        {source.chunkCount || 1}
                                      </span>
                                    )}
                                    {isFailed && (
                                      <>
                                        <span className="text-[11.5px] text-[var(--ws-danger)]">
                                          {isIngestRateLimited ? `Wait ${ingestCooldownSec}s` : 'Failed'}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={isIngestRateLimited}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRetrySource(source.id);
                                          }}
                                          aria-label={`Retry adding ${source.title}`}
                                          className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                        >
                                          <RotateCw size={11} />
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveSource(source.id);
                                      }}
                                      aria-label={`Remove ${source.title}`}
                                      className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="font-ui max-w-xs text-[12px]">
                                  <p className="font-semibold">{source.title}</p>
                                  <p className="text-[var(--ws-ink-soft)]">{tooltipMessage}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <label htmlFor="home-prompt" className="sr-only">Ask Scout a research question</label>
                    <textarea
                      id="home-prompt"
                      ref={promptInputRef}
                      rows={2}
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask a question, or paste a link to read"
                      className="block w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-relaxed text-[var(--ws-ink)] outline-none placeholder:text-[var(--ws-ink-faint)] sm:text-[15px]"
                    />

                    <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
                      <div className="flex min-w-0 items-center gap-0.5">
                        {isIngestRateLimited ? (
                          <span className="px-2 text-[12.5px] text-[var(--ws-danger)]">
                            Adding sources is paused. Ready again in {ingestCooldownSec}s.
                          </span>
                        ) : (
                          sourceStarters.map((item) => {
                            const Icon = KIND_ICON[item.kind];
                            return (
                              <button
                                key={item.kind}
                                type="button"
                                onClick={() => {
                                  if (item.opens === 'file') fileInputRef.current?.click();
                                  else setSourceModalType(item.opens);
                                  setPrompt((prev) => (prev.trim() ? prev : item.prompt));
                                }}
                                aria-label={`Add ${item.label}`}
                                title={`Add ${item.label}`}
                                className="flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-[12.5px] font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                              >
                                <Icon size={15} style={{ color: kindColor(item.kind, isLight) }} />
                                <span className="hidden sm:inline">{item.label}</span>
                              </button>
                            );
                          })
                        )}
                        {isAnySourceIndexing && (
                          <span className="ml-1 hidden items-center gap-1.5 text-[12px] text-[var(--ws-ingest)] tabular-nums xs:flex">
                            <Loader2 size={12} className="animate-spin" />
                            {isAnySourceEmbedding ? 'Indexing' : 'Reading'} {indexingProgress}%
                          </span>
                        )}
                      </div>

                      <span className="ml-auto hidden text-right text-[12px] text-[var(--ws-ink-faint)] md:inline">
                        Links you paste are saved as sources
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={!canSubmit || isSubmitting || isAnySourceIndexing}
                        aria-label="Start research"
                        title="Start research (Enter)"
                        className={cn(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-[12px] transition-colors',
                          canSubmit && !isSubmitting && !isAnySourceIndexing
                            ? 'bg-[var(--ws-accent)] text-white hover:brightness-110 cursor-pointer'
                            : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-faint)] cursor-not-allowed'
                        )}
                      >
                        {isSubmitting || isAnySourceIndexing ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
                      </button>
                    </div>
                  </div>
                  {/* Suggested questions branch off the composer like edges on the knowledge map */}
                  <section aria-labelledby="home-ideas" className={cn('home-branch relative ml-[22px]', isCuriosityLoading && 'is-loading')}>
                    <span className="home-branch-spine" aria-hidden />
                    <div className="relative flex min-h-9 items-center gap-2 pl-5 pt-4">
                      <span className="home-branch-node is-root" aria-hidden />
                      <h2 id="home-ideas" className="text-[13px] font-semibold">
                        {hasMemoryPrompts ? 'Questions from your knowledge map' : 'Questions to start with'}
                      </h2>
                      {isAuthenticated && (
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => refreshCuriosityMutation.mutate()}
                              disabled={isCuriosityLoading}
                              aria-label="Suggest new questions from your knowledge map"
                              className="grid h-7 w-7 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-wait cursor-pointer"
                            >
                              <RotateCw size={13} className={cn(isCuriosityLoading && 'animate-spin text-[var(--ws-accent-ink)]')} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Suggest new questions from your knowledge map</TooltipContent>
                        </Tooltip>
                      )}
                      {isCuriosityLoading && (
                        <span className="text-[12px] text-[var(--ws-ink-faint)] tabular-nums">Finding questions {Math.round(curiosityProgress)}%</span>
                      )}
                    </div>

                    <ol className={cn('flex flex-col transition-opacity duration-300', isCuriosityLoading && 'opacity-50')}>
                      {promptSuggestions.map((suggestion, idx) => (
                        <li key={idx} className="relative">
                          <span className="home-branch-node" aria-hidden />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectSuggestedPrompt(suggestion);
                            }}
                            disabled={isCuriosityLoading}
                            className="home-branch-leaf w-full rounded-r-[10px] py-2 pl-5 pr-3 text-left text-[14px] leading-snug text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-wait cursor-pointer"
                          >
                            {suggestion}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </section>
                </main>

                <footer className="mx-auto flex w-full max-w-[680px] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-4 text-[12px] text-[var(--ws-ink-soft)] select-none">
                  <span>© 2026 Scout</span>
                  <span>
                    Photo by{' '}
                    <a
                      href={UNSPLASH_CREDIT.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-[var(--ws-ink-faint)] underline-offset-2 hover:text-[var(--ws-ink)]"
                    >
                      {UNSPLASH_CREDIT.author}
                    </a>{' '}
                    on{' '}
                    <a
                      href={UNSPLASH_CREDIT.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-[var(--ws-ink-faint)] underline-offset-2 hover:text-[var(--ws-ink)]"
                    >
                      Unsplash
                    </a>
                  </span>
                </footer>
              </div>
              </div>
            </DropZone>
          )}
        </div>

        {/* ── ADD-SOURCE DIALOG (same as the workspace's) ── */}
        <Dialog open={Boolean(sourceModalType && modalTitles[sourceModalType])} onOpenChange={(o) => !o && setSourceModalType(null)}>
          {sourceModalType && modalTitles[sourceModalType] && (() => {
            const copy = modalTitles[sourceModalType];
            const Icon = KIND_ICON[copy.kind];
            const submitSource = () => {
              if (sourceInputVal.trim()) handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
            };
            return (
              <DialogContent className="font-ui w-[92vw] max-w-md rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-dock)] p-6 text-[var(--ws-ink)] shadow-[var(--ws-shadow)]">
                <DialogHeader className="p-0 pr-8">
                  <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
                    <Icon size={18} style={{ color: kindColor(copy.kind, isLight) }} />
                    {copy.title}
                  </DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitSource();
                  }}
                  className="flex flex-col gap-3 pt-1"
                >
                  <p className="text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">{copy.desc}</p>
                  <input
                    autoFocus
                    type="url"
                    inputMode="url"
                    value={sourceInputVal}
                    onChange={(e) => setSourceInputVal(e.target.value)}
                    placeholder={copy.placeholder}
                    aria-label={copy.title}
                    className="h-10 w-full rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-3.5 text-base sm:text-[13px] text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] outline-none focus:border-[var(--ws-accent)] focus:ring-2 focus:ring-[var(--ws-accent-wash)]"
                  />
                  <DialogFooter className="gap-2 p-0 pt-1 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setSourceModalType(null)}
                      className="h-9 rounded-[12px] px-4 text-[13px] font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!sourceInputVal.trim()}
                      className={cn(
                        'h-9 rounded-[12px] px-4 text-[13px] font-semibold transition-colors',
                        sourceInputVal.trim()
                          ? 'bg-[var(--ws-accent)] text-white hover:brightness-110 cursor-pointer'
                          : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-faint)] cursor-not-allowed'
                      )}
                    >
                      {copy.cta}
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            );
          })()}
        </Dialog>

      </div>
    </TooltipProvider>
  );
}