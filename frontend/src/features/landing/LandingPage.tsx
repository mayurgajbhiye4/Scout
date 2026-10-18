import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  ArrowUp,
  Youtube,
  FileText,
  Github,
  Globe,
  X,
  Sparkles,
  Layers,
  BrainCircuit,
  Database,
  Network,
  LogIn,
  MessageSquare,
  ArrowUpRight,
  Trash2,
  Loader2,
  Check,
  RotateCw,
  FolderKanban,
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { sessionsApi } from '@/api/sessions';
import { sourcesApi } from '@/api/sources';
import { knowledgeApi } from '@/api/knowledge';
import { soundEffects, useSoundEffects } from '@/lib/soundEffects';
import CuriosityMap from '@/components/memory/CuriosityMap';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import LogoutConfirmPopover from '@/features/auth/LogoutConfirmPopover';
import LandingChatWindow from '@/features/landing/LandingChatWindow';
import LandingSessionsWindow from '@/features/landing/LandingSessionsWindow';
import LandingSourcesWindow from '@/features/landing/LandingSourcesWindow';
import { useAuth } from '@/features/auth/useAuth';
import {
  normalizeSourceTitle,
  formatSessionTitle,
  deriveInitialSessionTitle,
  formatRelativeTime,
} from '@/lib/formatters';
import DropZone from '@/components/workspace/DropZone';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import NeonArcadeBackground from '@/components/ui/NeonArcadeBackground';

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
  mode?: string;
}

const SESSIONS_PAGE_SIZE = 20;

function getSourceBadge(source: any) {
  const type = (source?.source_type || '').toLowerCase();
  const uri = (source?.canonical_uri || '').toLowerCase();
  const title = (source?.title || '').toLowerCase();

  if (type === 'youtube' || uri.includes('youtube.com') || uri.includes('youtu.be')) {
    return {
      label: 'YT',
      icon: <Youtube size={9} className="text-[#ef4444]" />,
      className: 'bg-[#ef4444]/10 text-[#f87171] border-[#ef4444]/30',
    };
  }
  if (type === 'github' || uri.includes('github.com')) {
    return {
      label: 'GitHub',
      icon: <Github size={9} className="text-[#a855f7]" />,
      className: 'bg-[#a855f7]/10 text-[#c084fc] border-[#a855f7]/30',
    };
  }
  if (type === 'pdf' || uri.endsWith('.pdf') || title.endsWith('.pdf')) {
    return {
      label: 'PDF',
      icon: <FileText size={9} className="text-[#f59e0b]" />,
      className: 'bg-[#f59e0b]/10 text-[#fbbf24] border-[#f59e0b]/30',
    };
  }
  return {
    label: 'Docs',
    icon: <Globe size={9} className="text-[#2dd4bf]" />,
    className: 'bg-[#2dd4bf]/10 text-[#2dd4bf] border-[#2dd4bf]/30',
  };
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, logout } = useAuth();
  const { soundEnabled, toggleSound } = useSoundEffects();
  const prevIndexingRef = useRef<boolean>(false);

  const [prompt, setPrompt] = useState<string>('');
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(true);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
  const [isSessionsFlyoutOpen, setIsSessionsFlyoutOpen] = useState<boolean>(false);
  const [sessionsSearchQuery, setSessionsSearchQuery] = useState<string>('');
  const [sessionsFilterMode, setSessionsFilterMode] = useState<'all' | 'research' | 'ask'>('all');
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);

  useEffect(() => {
    setSelectedSessionIndex(0);
  }, [sessionsSearchQuery, sessionsFilterMode, isSessionsFlyoutOpen]);
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

  useEffect(() => {
    if (routeSessionId) {
      setActiveTabId(routeSessionId);
      setActiveSessionId(routeSessionId);
      setOpenTabs((prev) => {
        if (prev.some((t) => t.id === routeSessionId)) return prev;
        return [
          ...prev,
          {
            id: routeSessionId,
            title: 'Research Session',
            mode: 'research',
          },
        ];
      });
    }
  }, [routeSessionId]);

  const [initialChatPrompt, setInitialChatPrompt] = useState<string | null>(null);
  const [showSessionsGallery, setShowSessionsGallery] = useState<boolean>(false);
  const [showSourcesGallery, setShowSourcesGallery] = useState<boolean>(false);
  const [showGraphView, setShowGraphView] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarSentinelRef = useRef<HTMLDivElement>(null);

  const openSessionTab = (session: { id: string; title: string; mode?: string }) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === session.id)) return prev;
      return [...prev, { id: session.id, title: session.title, mode: session.mode }];
    });
    setActiveTabId(session.id);
    setActiveSessionId(session.id);
    setShowSessionsGallery(false);
    setShowSourcesGallery(false);
    setShowGraphView(false);
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
          navigate('/');
        }
      }
      return nextTabs;
    });
  };

  const switchToExplore = () => {
    setActiveTabId('explore');
    setActiveSessionId(null);
    setShowSessionsGallery(false);
    setShowSourcesGallery(false);
    setShowGraphView(false);
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

  const toggleSessionsFlyout = () => {
    setIsSessionsFlyoutOpen((prev) => !prev);
  };

  const { data: sourcesData } = useQuery({
    queryKey: ['sources'],
    queryFn: () => sourcesApi.listSources(),
    enabled: isAuthenticated,
  });
  const totalSourcesCount = sourcesData?.length || 0;

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
      if (sessionsFilterMode !== 'all') {
        const isResearch = s.mode === 'research' || s.mode === 'deep_research';
        if (sessionsFilterMode === 'research' && !isResearch) return false;
        if (sessionsFilterMode === 'ask' && isResearch) return false;
      }
      if (sessionsSearchQuery.trim()) {
        const q = sessionsSearchQuery.toLowerCase();
        const titleMatch = s.title.toLowerCase().includes(q);
        const summaryMatch = (s.session_summary || '').toLowerCase().includes(q);
        const sourceMatch = (s.sources || []).some((src: any) =>
          (src.title || '').toLowerCase().includes(q) ||
          (src.canonical_uri || '').toLowerCase().includes(q)
        );
        return titleMatch || summaryMatch || sourceMatch;
      }
      return true;
    });
  }, [sessions, sessionsFilterMode, sessionsSearchQuery]);

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
            openSessionTab({ id: target.id, title: target.title, mode: target.mode });
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
  }, [isSessionsFlyoutOpen, filteredSessions, selectedSessionIndex]);

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

  useEffect(() => {
    if (!isCuriosityLoading) {
      if (curiosityProgress > 0) {
        setCuriosityProgress(100);
        const t = setTimeout(() => setCuriosityProgress(0), 700);
        return () => clearTimeout(t);
      }
      return;
    }

    setCuriosityProgress(10);
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
    } catch (err: any) {
      clearTimeout(timer);
      console.error('Source ingestion failed:', err);
      const errorDetail = err?.response?.data?.detail;
      const errorMsg =
        typeof errorDetail === 'string'
          ? errorDetail
          : Array.isArray(errorDetail)
          ? errorDetail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
          : err?.message || 'Ingestion failed';
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

  useEffect(() => {
    if (!isAnySourceIndexing) {
      if (prevIndexingRef.current && attachedSources.length > 0 && attachedSources.every((s) => s.status === 'ready')) {
        soundEffects.playEmbeddingComplete();
      }
      prevIndexingRef.current = false;
      if (attachedSources.length > 0 && attachedSources.every((s) => s.status === 'ready')) {
        setIndexingProgress(100);
        const t = setTimeout(() => setIndexingProgress(0), 1000);
        return () => clearTimeout(t);
      }
      setIndexingProgress(0);
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
  }, [isAnySourceIndexing, isAnySourceEmbedding, attachedSources]);

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
          mode: reasoningEnabled ? 'research' : 'ask',
          source_policy: 'source_first',
          source_ids: readySourceIds.length > 0 ? readySourceIds : undefined,
        });

        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['sources'] });
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
        setInitialChatPrompt(prompt);
        openSessionTab({
          id: newSession.id,
          title: newSession.title || deriveInitialSessionTitle(prompt, attachedSources),
          mode: newSession.mode,
        });
        setPrompt('');
        setAttachedSources([]);
      } catch (err) {
        console.error('Session creation failed:', err);
        const draft = { prompt, reasoningEnabled, sources: attachedSources };
        navigate('/sessions', { state: { draft } });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const draft = { prompt, reasoningEnabled, sources: attachedSources };
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

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'youtube': return <Youtube size={13} className="text-[#EF4444]" />;
      case 'pdf': return <FileText size={13} className="text-[#F59E0B]" />;
      case 'github': return <Github size={13} className="text-[#A855F7]" />;
      default: return <Globe size={13} className="text-[#E4E4E7]" />;
    }
  };

  const quickStarters = [
    {
      label: 'YouTube Analysis',
      icon: <Youtube size={13} className="text-[#EF4444]" />,
      isNew: true,
      prompt: 'Extract key insights, chapters, and fact-check arguments from this lecture video: ',
      action: () => setSourceModalType('youtube'),
    },
    {
      label: 'PDF Synthesis',
      icon: <FileText size={13} className="text-[#F59E0B]" />,
      prompt: 'Synthesize methodology and empirical conclusions from the uploaded PDF paper.',
      action: () => fileInputRef.current?.click(),
    },
    {
      label: 'GitHub Codebase',
      icon: <Github size={13} className="text-[#A855F7]" />,
      prompt: 'Analyze repository architecture and summarize technical design tradeoffs: ',
      action: () => setSourceModalType('github'),
    },
    {
      label: 'Doc & Web Crawler',
      icon: <Globe size={13} className="text-[#E4E4E7]" />,
      prompt: 'Index this documentation site and explain core API patterns: ',
      action: () => setSourceModalType('docs'),
    },
    {
      label: 'Tech Trends',
      icon: <Sparkles size={13} className="text-[#F59E0B]" />,
      prompt: 'Identify emerging breakthroughs and paradigm shifts in AI agent architectures.',
    },
    {
      label: 'Multi-Paper Review',
      icon: <Layers size={13} className="text-[#10B981]" />,
      prompt: 'Synthesize consensus and conflicting findings across recent benchmark publications.',
    },
  ];

  const modalTitles: Record<string, { icon: React.ReactNode; title: string; desc: string; placeholder: string }> = {
    youtube: {
      icon: <Youtube size={20} className="text-[#EF4444]" />,
      title: 'Add YouTube Video Link',
      desc: 'Paste a YouTube video or playlist URL. The agent will fetch transcripts, chapters, and extract key insights.',
      placeholder: 'https://www.youtube.com/watch?v=...',
    },
    github: {
      icon: <Github size={20} className="text-[#A855F7]" />,
      title: 'Add GitHub Repository',
      desc: 'Paste a public GitHub repo URL to index the full codebase.',
      placeholder: 'https://github.com/owner/repository',
    },
    docs: {
      icon: <Globe size={20} className="text-[#E4E4E7]" />,
      title: 'Add Documentation / Web Link',
      desc: 'Paste any web page or documentation link to extract and ground answers against it.',
      placeholder: 'https://docs.example.com',
    },
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative w-screen h-screen max-h-screen overflow-hidden bg-[#0d0d0f] text-[#F4F4F5] flex flex-col">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.txt,.md,.doc,.docx"
          onChange={handleFileUpload}
        />

        {/* ── 1. THE FLOATING MISSION ISLAND (Ultra-Modern Apple / Raycast Capsule) ── */}
        <nav
          className={cn(
            "fixed top-3 sm:top-3.5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 sm:gap-1.5",
            "px-2 sm:px-3 py-1.5 rounded-full",
            "bg-[#0e0e12]/85 backdrop-blur-2xl border border-white/[0.08]",
            "shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.4)]",
            "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none font-mono",
            "hover:border-white/[0.15] hover:shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.1)]"
          )}
        >
          {/* Brand Beacon */}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full hover:bg-white/[0.06] transition-all cursor-pointer group active:scale-95"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3b82f6] shadow-[0_0_8px_#3b82f6]" />
                </span>
                <span className="font-arcade text-xs font-bold tracking-wider text-white uppercase hidden xs:inline">
                  SCOUT
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Scout Research Workspace (⌘1)
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-white/10 shrink-0 mx-0.5" />

          {/* Segmented Mode Navigation Capsules */}
          <div className="flex items-center gap-1">
            {/* Explore Studio */}
            <button
              type="button"
              onClick={switchToExplore}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all duration-200 cursor-pointer active:scale-95",
                activeSessionId === null && !showSessionsGallery && !showSourcesGallery && !showGraphView
                  ? "bg-[#1e293b] text-white shadow-[0_0_14px_rgba(59,130,246,0.4)] border border-[#3b82f6]/50 font-semibold"
                  : "text-[#a1a1aa] hover:text-white hover:bg-white/[0.06] border border-transparent"
              )}
            >
              <Sparkles
                size={12}
                className={activeSessionId === null && !showSessionsGallery && !showSourcesGallery && !showGraphView ? "text-[#3b82f6]" : "text-[#71717a]"}
              />
              <span className="hidden sm:inline">Explore</span>
            </button>

            {/* Sessions (Raycast Trigger) */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSessionsFlyout}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all duration-200 cursor-pointer active:scale-95",
                    isSessionsFlyoutOpen
                      ? "bg-[#1e293b] text-white shadow-[0_0_14px_rgba(59,130,246,0.4)] border border-[#3b82f6]/50 font-semibold"
                      : "text-[#a1a1aa] hover:text-white hover:bg-white/[0.06] border border-transparent"
                  )}
                >
                  <FolderKanban size={12} className={isSessionsFlyoutOpen ? "text-[#3b82f6]" : "text-[#71717a]"} />
                  <span className="hidden sm:inline">Sessions</span>
                  {sessions.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono leading-none bg-[#2563eb]/20 text-[#60a5fa] border border-[#2563eb]/40">
                      {sessions.length}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Raycast Mission Palette (⌘K)
              </TooltipContent>
            </Tooltip>

            {/* Sources Matrix */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setShowSourcesGallery(true);
                    setShowSessionsGallery(false);
                    setShowGraphView(false);
                    setActiveSessionId(null);
                    setIsSessionsFlyoutOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono transition-all duration-200 cursor-pointer active:scale-95",
                    showSourcesGallery
                      ? "bg-[#1e293b] text-white shadow-[0_0_14px_rgba(59,130,246,0.4)] border border-[#3b82f6]/50 font-semibold"
                      : "text-[#a1a1aa] hover:text-white hover:bg-white/[0.06] border border-transparent"
                  )}
                >
                  <Database size={12} className={showSourcesGallery ? "text-[#3b82f6]" : "text-[#71717a]"} />
                  <span className="hidden md:inline">Sources</span>
                  {totalSourcesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono leading-none bg-white/[0.08] text-[#a1a1aa] border border-white/10">
                      {totalSourcesCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Knowledge Sources Matrix
              </TooltipContent>
            </Tooltip>

            {/* Neural Graph */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setShowGraphView(true);
                    setShowSourcesGallery(false);
                    setShowSessionsGallery(false);
                    setActiveSessionId(null);
                    setIsSessionsFlyoutOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono transition-all duration-200 cursor-pointer active:scale-95",
                    showGraphView
                      ? "bg-[#1e293b] text-white shadow-[0_0_14px_rgba(59,130,246,0.4)] border border-[#3b82f6]/50 font-semibold"
                      : "text-[#a1a1aa] hover:text-white hover:bg-white/[0.06] border border-transparent"
                  )}
                >
                  <Network size={12} className={showGraphView ? "text-[#3b82f6]" : "text-[#71717a]"} />
                  <span className="hidden md:inline">Graph</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Curiosity Map & Neural Graph
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Active Research Indicator Capsule (If in session) */}
          {activeSessionId && !showSessionsGallery && !showSourcesGallery && !showGraphView && (
            <>
              <div className="h-4 w-px bg-white/10 shrink-0 mx-0.5" />
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#181822] border border-[#3b82f6]/40 text-xs font-mono max-w-[130px] sm:max-w-[190px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0 animate-pulse" />
                <span className="truncate text-[11px] text-[#f4f4f5]">
                  {formatSessionTitle(sessions.find((s) => s.id === activeSessionId)?.title || 'Research Session')}
                </span>
                <button
                  type="button"
                  onClick={switchToExplore}
                  title="Close session (Esc / ⌘1)"
                  className="p-0.5 hover:bg-white/10 rounded-full text-[#71717a] hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            </>
          )}

          <div className="h-4 w-px bg-white/10 shrink-0 mx-0.5" />

          {/* Quick Action Dock */}
          <div className="flex items-center gap-1">
            {/* New Investigation */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-[#2563eb] text-[#a1a1aa] hover:text-white border border-white/10 hover:border-[#3b82f6] flex items-center justify-center transition-all cursor-pointer active:scale-95"
                >
                  <Plus size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                New Investigation (⌘N)
              </TooltipContent>
            </Tooltip>

            {/* Raycast Quick Shortcut */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSessionsFlyout}
                  className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[#a1a1aa] hover:text-white text-[10px] font-mono transition-all cursor-pointer active:scale-95"
                >
                  <Search size={10} />
                  <span>⌘K</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Quick Mission Palette (⌘K / ⌘B)
              </TooltipContent>
            </Tooltip>

            {/* Arcade Sound FX Toggle */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSound}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-mono transition-all cursor-pointer active:scale-95 select-none",
                    soundEnabled
                      ? "bg-[#3b82f6]/10 border-[#3b82f6]/40 text-[#93c5fd] hover:bg-[#3b82f6]/20"
                      : "bg-white/[0.04] border-white/10 text-[#71717a] hover:text-[#a1a1aa] hover:bg-white/[0.08]"
                  )}
                  aria-label="Toggle Sound Effects"
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 size={11} className="text-[#60a5fa]" />
                      <span className="hidden md:inline font-bold">SFX ON</span>
                    </>
                  ) : (
                    <>
                      <VolumeX size={11} className="text-[#71717a]" />
                      <span className="hidden md:inline">SFX OFF</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {soundEnabled ? 'Arcade Sound Effects: ON (Click to Mute)' : 'Arcade Sound Effects: OFF (Click to Enable)'}
              </TooltipContent>
            </Tooltip>

            {/* User Avatar */}
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <div>
                  {isAuthenticated ? (
                    <LogoutConfirmPopover user={user} onLogout={logout} side="bottom" align="end" sideOffset={12}>
                      <button
                        type="button"
                        className="w-7 h-7 rounded-full bg-[#18181b] hover:bg-[#202026] border border-white/15 hover:border-[#3b82f6] flex items-center justify-center text-xs font-semibold text-[#3b82f6] transition-colors cursor-pointer active:scale-95"
                      >
                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                      </button>
                    </LogoutConfirmPopover>
                  ) : (
                    <button
                      onClick={() => navigate('/login')}
                      className="w-7 h-7 rounded-full bg-[#18181b] hover:bg-[#202026] border border-white/15 hover:border-[#3b82f6] flex items-center justify-center text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors cursor-pointer active:scale-95"
                    >
                      <LogIn size={12} />
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isAuthenticated ? `${user?.name || 'Account'} (Log out)` : 'Log In'}
              </TooltipContent>
            </Tooltip>
          </div>
        </nav>

        {/* ── 2. RAYCAST FLOATING SESSIONS COMMAND PALETTE (Apple / Raycast Feel) ── */}
        {isSessionsFlyoutOpen && (
          <>
            {/* Frosted Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/65 backdrop-blur-md transition-opacity duration-200 animate-in fade-in"
              onClick={() => setIsSessionsFlyoutOpen(false)}
            />

            {/* Centered Raycast Dialog */}
            <div
              className={cn(
                "fixed top-16 sm:top-18 left-1/2 -translate-x-1/2 z-50",
                "w-[94vw] max-w-2xl max-h-[82vh]",
                "bg-[#111116]/95 backdrop-blur-3xl border border-white/10 rounded-2xl",
                "shadow-[0_32px_80px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.08)]",
                "flex flex-col overflow-hidden font-mono select-none",
                "animate-in fade-in zoom-in-95 duration-200"
              )}
            >
              {/* Raycast Header: Search Input & Mode Chips */}
              <div className="p-3.5 border-b border-white/[0.08] bg-[#14141a]/90 space-y-2.5 shrink-0">
                <div className="relative flex items-center">
                  <Search size={16} className="absolute left-3 text-[#3b82f6] pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={sessionsSearchQuery}
                    onChange={(e) => setSessionsSearchQuery(e.target.value)}
                    placeholder="Search research sessions, topics, grounded sources..."
                    className="w-full pl-9 pr-24 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f4f4f5] placeholder:text-[#71717a] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/50 transition-all"
                  />
                  <div className="absolute right-2.5 flex items-center gap-1.5">
                    {sessionsSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setSessionsSearchQuery('')}
                        className="text-[#71717a] hover:text-[#f4f4f5] p-1 cursor-pointer"
                        title="Clear search"
                      >
                        <X size={12} />
                      </button>
                    )}
                    <span className="text-[10px] font-mono text-[#71717a] bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/10">
                      {filteredSessions.length}
                    </span>
                  </div>
                </div>

                {/* Filter Pills & Gallery Link */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    {(['all', 'research', 'ask'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSessionsFilterMode(m)}
                        className={cn(
                          "px-2.5 py-0.5 rounded-full border transition-all cursor-pointer font-mono capitalize",
                          sessionsFilterMode === m
                            ? "bg-[#1e293b] text-white border-[#3b82f6] font-semibold shadow-sm"
                            : "bg-white/[0.04] text-[#71717a] hover:text-[#a1a1aa] border-white/[0.06] hover:border-white/10"
                        )}
                      >
                        {m === 'all' ? 'All Sessions' : m === 'research' ? 'Deep Research' : 'Quick Ask'}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSessionsGallery(true);
                        setShowSourcesGallery(false);
                        setShowGraphView(false);
                        setActiveSessionId(null);
                        setIsSessionsFlyoutOpen(false);
                      }}
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] text-[#a1a1aa] hover:text-[#3b82f6] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
                    >
                      <span>Grid Gallery</span>
                      <ArrowUpRight size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSessionsFlyoutOpen(false)}
                      className="p-1 text-[#71717a] hover:text-[#f4f4f5] hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                      title="Close (Esc)"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable List of Rich Bento Cards */}
              <div
                ref={sidebarScrollRef}
                onScroll={handleSidebarScroll}
                className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-2 sidebar-scroll max-h-[55vh]"
              >
                {!isAuthenticated ? (
                  <div className="py-8 px-4 text-center text-xs text-[#71717A] bg-[#141418] border border-white/10 rounded-xl">
                    <BrainCircuit size={24} className="mx-auto mb-2.5 text-[#3b82f6]" />
                    <p className="text-[#A1A1AA] font-semibold mb-1">Sign in to save research</p>
                    <p className="text-[11px] text-[#71717A] mb-3 leading-relaxed">
                      Your grounded investigations and synthesis sessions will appear here.
                    </p>
                    <button
                      onClick={() => navigate('/login')}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-full transition-colors cursor-pointer"
                    >
                      Log in
                    </button>
                  </div>
                ) : isLoadingSessions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="p-3.5 bg-[#141418] border border-white/[0.06] rounded-xl space-y-2 animate-pulse"
                      >
                        <div className="flex items-center justify-between">
                          <div className="h-3 bg-white/10 rounded w-20" />
                          <div className="h-2.5 bg-white/5 rounded w-12" />
                        </div>
                        <div className="h-3.5 bg-white/10 rounded w-4/5" />
                        <div className="h-2.5 bg-white/5 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-[#71717A] bg-[#141418] border border-white/[0.06] rounded-xl">
                    <MessageSquare size={22} className="mx-auto mb-2 text-[#71717A]" />
                    <p className="font-semibold text-[#A1A1AA] mb-1">
                      {sessionsSearchQuery ? 'No matching sessions' : 'No research sessions yet'}
                    </p>
                    <p className="text-[11px] text-[#71717A] mb-3 leading-relaxed">
                      {sessionsSearchQuery
                        ? 'Try another search keyword or clear the mode filter.'
                        : 'Start an investigation with YouTube, PDF, or GitHub grounding.'}
                    </p>
                    {sessionsSearchQuery ? (
                      <button
                        onClick={() => setSessionsSearchQuery('')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/[0.08] hover:bg-white/[0.12] text-[#F4F4F5] rounded-full border border-white/10 transition-colors cursor-pointer"
                      >
                        <X size={12} />
                        <span>Clear filter</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleNewChat}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-full transition-colors cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Start investigation</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredSessions.map((session, idx) => {
                    const isSelected = selectedSessionIndex === idx;
                    const isActive = activeSessionId === session.id;
                    const isResearch = session.mode === 'research' || session.mode === 'deep_research';

                    return (
                      <div
                        key={session.id}
                        onMouseEnter={() => setSelectedSessionIndex(idx)}
                        onClick={() => {
                          openSessionTab({ id: session.id, title: session.title, mode: session.mode });
                        }}
                        className={cn(
                          "group relative flex flex-col p-3 rounded-xl border transition-all duration-150 cursor-pointer select-none text-left",
                          isSelected
                            ? "bg-[#181824] border-[#3b82f6] shadow-[0_4px_24px_rgba(37,99,235,0.25)] ring-1 ring-[#3b82f6]/60 -translate-y-0.5"
                            : isActive
                              ? "bg-[#161620] border-[#3b82f6]/40"
                              : "bg-[#131317] hover:bg-[#16161c] border-white/[0.06] hover:border-white/15"
                        )}
                      >
                        {/* Active Accent Dot */}
                        {isActive && (
                          <span className="absolute left-2.5 top-3.5 w-1.5 h-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_6px_#3b82f6]" />
                        )}

                        {/* Top Row: Mode Pill, Relative Time, Quick Delete */}
                        <div className={cn("flex items-center justify-between gap-2 mb-1.5", isActive && "pl-3")}>
                          <div className="flex items-center gap-1.5">
                            {isResearch ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-mono font-medium bg-[#a855f7]/15 text-[#d8b4fe] border border-[#a855f7]/30">
                                <Sparkles size={8} className="text-[#a855f7]" />
                                <span>Deep Research</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-mono font-medium bg-[#3b82f6]/15 text-[#93c5fd] border border-[#3b82f6]/30">
                                <MessageSquare size={8} className="text-[#3b82f6]" />
                                <span>Quick Ask</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-[#71717a]">
                              {formatRelativeTime(session.last_activity_at || session.created_at)}
                            </span>
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
                                title="Delete session"
                                className="opacity-0 group-hover:opacity-100 p-1 text-[#71717A] hover:text-[#EF4444] hover:bg-white/10 rounded-full transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 size={11} />
                              </button>
                            </DeleteSessionPopover>
                          </div>
                        </div>

                        {/* Title */}
                        <h4
                          className={cn(
                            "text-xs font-semibold text-[#f4f4f5] group-hover:text-white line-clamp-2 leading-snug break-words mb-1.5",
                            isActive && "pl-3"
                          )}
                          title={formatSessionTitle(session.title)}
                        >
                          {formatSessionTitle(session.title)}
                        </h4>

                        {/* Grounded Sources Badges Row */}
                        <div className={cn("pt-2 border-t border-white/[0.06] flex items-center justify-between gap-1 text-[10px]", isActive && "pl-3")}>
                          {session.sources && session.sources.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap min-w-0">
                              {session.sources.slice(0, 3).map((src: any, srcIdx: number) => {
                                const badge = getSourceBadge(src);
                                return (
                                  <span
                                    key={src.id || srcIdx}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono border",
                                      badge.className
                                    )}
                                    title={src.title || src.canonical_uri}
                                  >
                                    {badge.icon}
                                    <span>{badge.label}</span>
                                  </span>
                                );
                              })}
                              {session.sources.length > 3 && (
                                <span className="text-[9px] font-mono text-[#71717a]">
                                  +{session.sources.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-[#52525b] italic">
                              Direct synthesis
                            </span>
                          )}

                          <div className="flex items-center gap-1 text-[9px] font-mono text-[#71717a] group-hover:text-[#3b82f6] transition-colors shrink-0">
                            <span>Open</span>
                            <span className="px-1 py-0.2 rounded bg-white/[0.06] border border-white/10 text-[8px]">↵</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={sidebarSentinelRef} className="h-1 w-full pointer-events-none" />

                {isFetchingNextPage && (
                  <div className="py-2 flex items-center justify-center gap-1.5 text-xs text-[#A1A1AA]">
                    <Loader2 size={12} className="animate-spin text-[#3b82f6] shrink-0" />
                    <span className="text-[10px] font-mono">Loading older sessions...</span>
                  </div>
                )}
              </div>

              {/* Raycast Action Bar Footer */}
              <div className="px-4 py-2 border-t border-white/[0.08] bg-[#0e0e12] flex items-center justify-between text-[11px] text-[#71717a] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="px-1.5 py-0.2 rounded bg-white/[0.08] border border-white/10 text-[9px] text-white">↵</span>
                    <span>Open</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="px-1.5 py-0.2 rounded bg-white/[0.08] border border-white/10 text-[9px] text-white">↑↓</span>
                    <span>Navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="px-1.5 py-0.2 rounded bg-white/[0.08] border border-white/10 text-[9px] text-white">Esc</span>
                    <span>Dismiss</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[#a1a1aa]">
                  <span>Raycast Mission Palette</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── 3. FULL-BLEED MAXIMALIST WORKSPACE (100% Full Width & Height) ── */}
        <div className="flex-1 w-full h-full min-w-0 flex flex-col bg-[#0d0d0f] relative overflow-hidden">
        {/* Animated Neon Arcade Background with Dynamic Horizon Progress Bar */}
        <NeonArcadeBackground
          isIndexing={isAnySourceIndexing || isCuriosityLoading}
          isEmbedding={isAnySourceEmbedding || isCuriosityLoading}
          isExtracting={isAnySourceExtracting}
          progressPercent={isAnySourceIndexing ? indexingProgress : (isCuriosityLoading ? curiosityProgress : undefined)}
        />

        {activeTabId !== 'explore' && activeSessionId && !showSessionsGallery && !showSourcesGallery && !showGraphView ? (
          <LandingChatWindow
            sessionId={activeSessionId}
            initialPrompt={initialChatPrompt}
            onClose={() => {
              switchToExplore();
            }}
            onSessionDeleted={() => {
              closeTab(activeSessionId);
            }}
          />
        ) : showSessionsGallery ? (
          <LandingSessionsWindow
            onSelectSession={(sessionId) => {
              const s = sessions.find((x) => x.id === sessionId);
              openSessionTab({
                id: sessionId,
                title: s?.title || 'Research Session',
                mode: s?.mode || 'research',
              });
            }}
            onClose={() => setShowSessionsGallery(false)}
            onNewChat={handleNewChat}
          />
        ) : showSourcesGallery ? (
          <LandingSourcesWindow
            onClose={() => setShowSourcesGallery(false)}
          />
        ) : showGraphView ? (
          <CuriosityMap
            fullscreen
            onClose={() => setShowGraphView(false)}
          />
        ) : (
          /* ── HERO PROMPT STUDIO (CENTERED BEHAVIOR IN REMAINING VIEWPORT) ── */
          <DropZone onDropSource={(content, type) => {
            if (type === 'file') handleAddSource('pdf', content, content);
            else handleAddSource('docs', content, content);
          }}>
            <div className="flex-1 w-full h-full overflow-y-auto flex flex-col items-center justify-between p-4 sm:p-6 sidebar-scroll relative z-10">
              <main className="w-full max-w-3xl flex flex-col items-center gap-6 my-auto py-6">

                {/* ── PIXEL ARCADE LOGO HEADER (opencode.ai style retro banner) ── */}
                <div className="flex flex-col items-center gap-2 text-center select-none pt-2">
                  <div className="flex items-center gap-3">
                    <span className="w-3.5 h-3.5 bg-[#3b82f6] border border-[#60a5fa] inline-block shadow-[2px_2px_0px_#000]" />
                    <h1 className="font-arcade text-4xl sm:text-5xl md:text-6xl font-bold tracking-widest text-[#FFFFFF] uppercase drop-shadow-[0_4px_0_#1d4ed8]">
                      SCOUT
                    </h1>
                    <span className="w-3.5 h-3.5 bg-[#3b82f6] border border-[#60a5fa] inline-block shadow-[2px_2px_0px_#000]" />
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-[#A1A1AA] tracking-wider uppercase">
                    <span>·</span>
                    <span>GROUNDED DEEP RESEARCH</span>
                  </div>
                </div>

                {/* ── ARCADE COMMAND BOX (Exact opencode.ai style with solid blue left bar) ── */}
                <div className="w-full max-w-3xl flex flex-col gap-2 relative">
                  <div className="relative w-full bg-[#1e1e24] border border-[#2f2f38] border-l-4 border-l-[#3b82f6] shadow-[4px_4px_0px_#000000] flex flex-col overflow-hidden">

                    {/* ── COMMAND BOX LINEAR PROGRESS BAR (TOP EDGE) ── */}
                    {isAnySourceIndexing && (
                      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#141418] border-b border-[#2a2a33] overflow-hidden z-20">
                        <div
                          className="h-full bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#06b6d4] transition-all duration-300 ease-out relative"
                          style={{ width: `${indexingProgress}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.4s_infinite]" />
                          <div className="absolute right-0 top-0 bottom-0 w-2 bg-white shadow-[0_0_8px_#ffffff,0_0_16px_#3b82f6]" />
                        </div>
                      </div>
                    )}

                    {/* Attached Sources Cartridges */}
                    {attachedSources.length > 0 && (
                      <div className="w-full border-b border-[#2a2a33] bg-[#16161a] p-3 flex flex-col gap-2 relative">
                        {/* Micro Linear Progress Bar along attached sources partition */}
                        {isAnySourceIndexing && (
                          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#18181b] overflow-hidden z-10">
                            <div
                              className="h-full bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#06b6d4] transition-all duration-300 ease-out"
                              style={{ width: `${indexingProgress}%` }}
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-[#A1A1AA] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-[#3b82f6]" />
                            <span>Attached Sources ({attachedSources.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAttachedSources([]); }}
                            className="text-[#71717A] hover:text-[#EF4444] transition-colors cursor-pointer text-[10px]"
                          >
                            [Clear all]
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {attachedSources.map((source) => {
                            const isExtracting = source.status === 'extracting';
                            const isEmbedding = source.status === 'embedding';
                            const isReady = source.status === 'ready';
                            const isFailed = source.status === 'failed';

                            const tooltipMessage = isExtracting
                              ? 'Extracting source text & parsing structure...'
                              : isEmbedding
                              ? 'Generating 768-dimensional neural vector embeddings...'
                              : isReady
                              ? `Indexed & ready for research (${source.chunkCount || 1} chunks)`
                              : (source.error || 'Ingestion failed - click retry');

                            return (
                              <Tooltip key={source.id} delayDuration={150}>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      'relative inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-none font-mono select-none overflow-hidden transition-all',
                                      'bg-[#18181b] hover:bg-[#202026] text-[#F4F4F5]',
                                      isFailed ? 'border-red-900/60' : 'border-[#27272a] hover:border-[#3f3f46]'
                                    )}
                                  >
                                    {/* Individual source micro linear progress bar at bottom of cartridge */}
                                    {(isExtracting || isEmbedding) && (
                                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#27272a] overflow-hidden">
                                        <div
                                          className={cn(
                                            'h-full bg-gradient-to-r from-[#2563eb] to-[#3b82f6] transition-all duration-300 ease-out',
                                            isExtracting ? 'w-[42%]' : 'w-[88%]'
                                          )}
                                        />
                                      </div>
                                    )}

                                    {getSourceIcon(source.type)}

                                    <span className="max-w-[160px] truncate" title={source.title}>
                                      {source.title}
                                    </span>

                                    {isExtracting && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-[#A1A1AA]">
                                        <Loader2 size={10} className="animate-spin text-[#71717A] shrink-0" />
                                        <span>Extracting...</span>
                                      </span>
                                    )}

                                    {isEmbedding && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-[#A1A1AA]">
                                        <Loader2 size={10} className="animate-spin text-[#71717A] shrink-0" />
                                        <span>Embedding...</span>
                                      </span>
                                    )}

                                    {isReady && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#A1A1AA]">
                                        <Check size={10} className="stroke-[2.5] text-[#71717A]" />
                                        <span>{source.chunkCount || 1} chunks</span>
                                      </span>
                                    )}

                                    {isFailed && (
                                      <div className="inline-flex items-center gap-1">
                                        <span className="text-[10px] text-red-400">Failed</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRetrySource(source.id);
                                          }}
                                          title="Retry indexing"
                                          className="text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                                        >
                                          <RotateCw size={10} />
                                        </button>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveSource(source.id);
                                      }}
                                      title="Remove source"
                                      className="text-[#71717A] hover:text-[#EF4444] transition-colors p-0.5 ml-0.5 cursor-pointer"
                                    >
                                      <X size={11} />
                                    </button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="font-mono text-xs bg-[#141418] border-[#27272a] text-[#F4F4F5] shadow-[0_8px_24px_rgba(0,0,0,0.9)] max-w-xs">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="font-semibold text-white flex items-center justify-between gap-2">
                                      <span className="truncate">{source.title}</span>
                                      <span className="text-[9px] uppercase px-1.5 py-0.2 bg-white/[0.08] text-[#A1A1AA] rounded-none">
                                        {source.status}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[#A1A1AA] leading-relaxed">
                                      {tooltipMessage}
                                    </span>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Prompt Input Area */}
                    <div className="relative flex items-start p-4 pb-2">
                      <span className="text-[#3b82f6] font-mono text-base font-black mr-2.5 mt-0.5 select-none">&gt;</span>
                      <div className="flex-1 relative">
                        <textarea
                          rows={2}
                          value={prompt}
                          onChange={(e) => {
                            setPrompt(e.target.value);
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="add a query, paste a link or start research..."
                          className="w-full border-none outline-none resize-none font-mono text-sm leading-relaxed text-[#F4F4F5] bg-transparent placeholder:text-[#52525B] p-0 caret-[#3b82f6]"
                        />
                      </div>
                    </div>

                    {/* Bottom Controls inside Box (Matches 'Build Claude Opus 4.5 OpenCode Zen') */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#18181d] border-t border-[#2a2a33]">
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs font-mono">

                        {/* Deep Reasoning Toggle */}
                        <button
                          type="button"
                          onClick={() => setReasoningEnabled(!reasoningEnabled)}
                          className={cn(
                            "px-2 py-0.5 border text-[11px] font-mono transition-colors cursor-pointer select-none",
                            reasoningEnabled
                              ? "bg-[#1e3a8a] border-[#2563eb] text-[#93c5fd] font-bold"
                              : "bg-[#141418] border-[#27272a] text-[#71717A] hover:text-[#A1A1AA]"
                          )}
                        >
                          [REASONING: {reasoningEnabled ? 'ON' : 'OFF'}]
                        </button>

                        {/* Attach Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="px-2 py-0.5 bg-[#141418] hover:bg-[#202028] text-[#A1A1AA] hover:text-[#F4F4F5] border border-[#27272a] hover:border-[#3b82f6] transition-colors text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={11} className="text-[#3b82f6]" />
                              <span>Attach</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="top" align="start" className="min-w-[210px] bg-[#141418] border-[#27272a] text-[#F4F4F5] rounded-none font-mono shadow-[3px_3px_0px_#000]">
                            <DropdownMenuItem onClick={() => setSourceModalType('youtube')} className="hover:bg-[#202028] cursor-pointer text-xs">
                              <Youtube size={13} className="text-[#EF4444]" /> Add YouTube Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="hover:bg-[#202028] cursor-pointer text-xs">
                              <FileText size={13} className="text-[#F59E0B]" /> Upload PDF / Document
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSourceModalType('github')} className="hover:bg-[#202028] cursor-pointer text-xs">
                              <Github size={13} className="text-[#A855F7]" /> Add GitHub Repository
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSourceModalType('docs')} className="hover:bg-[#202028] cursor-pointer text-xs">
                              <Globe size={13} className="text-[#3b82f6]" /> Add Docs / Website URL
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {isAnySourceIndexing && (
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="flex items-center gap-1.5 text-[#3b82f6]">
                              <Loader2 size={10} className="animate-spin text-[#3b82f6]" />
                              <span>{isAnySourceEmbedding ? 'Embedding vectors...' : 'Extracting content...'}</span>
                            </span>
                            <div className="w-16 h-1.5 bg-[#141418] border border-[#27272a] overflow-hidden hidden xs:block">
                              <div
                                className="h-full bg-gradient-to-r from-[#2563eb] to-[#3b82f6] transition-all duration-300 ease-out"
                                style={{ width: `${indexingProgress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-[#71717a] hidden xs:inline">{indexingProgress}%</span>
                          </div>
                        )}
                      </div>

                      {/* Send button */}
                      <button
                        onClick={() => handleSubmit()}
                        disabled={!canSubmit || isSubmitting || isAnySourceIndexing}
                        aria-label="Execute Research"
                        title="Send message"
                        className={cn(
                          "w-7 h-7 flex items-center justify-center transition-colors shrink-0 select-none border cursor-pointer",
                          canSubmit && !isSubmitting && !isAnySourceIndexing
                            ? "bg-[#2563eb] border-[#3b82f6] text-white hover:bg-[#1d4ed8] shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px]"
                            : "bg-[#141418] border-[#27272a] text-[#52525B] cursor-not-allowed"
                        )}
                      >
                        {isSubmitting || isAnySourceIndexing ? (
                          <Loader2 size={12} className="animate-spin text-[#3b82f6]" />
                        ) : (
                          <ArrowUp size={13} className={canSubmit ? 'text-white stroke-[3]' : 'text-[#52525B]'} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── CTRL + V PASTE STATEMENT BANNER ── */}
                <div className="inline-flex items-center justify-center gap-3 px-6 py-2.5 sm:px-8 sm:py-3 bg-[#131318] border-2 border-[#3b82f6]/70 hover:border-[#3b82f6] text-xs sm:text-sm font-mono select-none shadow-[3px_3px_0px_#000000] transition-all">
                  <span className="px-2.5 py-1 bg-[#1e293b] border border-[#3b82f6] text-[#93c5fd] font-bold text-xs tracking-wider shadow-[1px_1px_0px_#000000]">
                    CTRL + V
                  </span>
                  <span className="text-[#E4E4E7] font-medium tracking-wide">
                    TO PASTE A URL, ARTICLE, OR TEXT SNIPPET
                  </span>
                </div>

                {/* ── SUGGESTED TOPICS AS RETRO TILES ── */}
                <div className="flex flex-col items-center gap-2 w-full mt-1">
                  <div className="flex items-center gap-2 select-none">
                    <span className="text-[10px] font-bold tracking-wider text-[#71717A] uppercase font-mono flex items-center gap-1.5">
                      {isCuriosityLoading ? (
                        <>
                          <span className="w-1.5 h-1.5 bg-[#3b82f6] animate-ping" />
                          <span className="text-[#60a5fa] animate-pulse">[SYNTHESIZING MEMORY PROMPTS...]</span>
                        </>
                      ) : (
                        hasMemoryPrompts ? '[SUGGESTED FROM MEMORY]' : '[SUGGESTED TOPICS]'
                      )}
                    </span>
                    {isAuthenticated && (
                      <Tooltip delayDuration={150}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => refreshCuriosityMutation.mutate()}
                            disabled={isCuriosityLoading}
                            aria-label="Refresh prompts from latest knowledge graph"
                            className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[#71717A] transition-all cursor-pointer select-none",
                              isCuriosityLoading
                                ? "bg-[#1e3a8a]/40 border-[#3b82f6]/50 text-[#60a5fa] cursor-wait"
                                : "bg-[#141418] border-[#27272a] hover:text-[#3b82f6] hover:border-[#3b82f6]/40"
                            )}
                          >
                            <RotateCw
                              size={10}
                              className={cn('transition-transform', isCuriosityLoading && 'animate-spin text-[#3b82f6]')}
                            />
                            {isCuriosityLoading && (
                              <span className="text-[9px] font-mono text-[#60a5fa] hidden sm:inline">
                                Refreshing...
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {isCuriosityLoading ? 'Generating fresh knowledge prompts (~7s)...' : 'Regenerate curiosity prompts from memory graph'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* ── SEPARATE RETRO LINEAR PROGRESS BAR FOR REFRESH OPERATION ── */}
                  {isCuriosityLoading && (
                    <div className="w-full max-w-sm flex flex-col gap-1 items-center animate-in fade-in duration-200 my-1">
                      <div className="w-full h-1.5 bg-[#141418] border border-[#27272a] overflow-hidden relative shadow-[0_0_10px_rgba(37,99,235,0.3)]">
                        <div
                          className="h-full bg-gradient-to-r from-[#2563eb] via-[#38bdf8] to-[#06b6d4] transition-all duration-200 ease-out relative"
                          style={{ width: `${curiosityProgress}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-[shimmer_1.2s_infinite]" />
                          <div className="absolute right-0 top-0 bottom-0 w-2 bg-white shadow-[0_0_8px_#ffffff,0_0_12px_#38bdf8]" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full text-[9px] font-mono text-[#71717a] px-0.5">
                        <span className="flex items-center gap-1.5 text-[#60a5fa]">
                          <Loader2 size={10} className="animate-spin text-[#3b82f6] shrink-0" />
                          <span>Generating fresh prompts from knowledge graph...</span>
                        </span>
                        <span className="tabular-nums font-semibold text-[#93c5fd]">{Math.round(curiosityProgress)}%</span>
                      </div>
                    </div>
                  )}

                  <div className={cn("flex flex-wrap items-center justify-center gap-2 w-full transition-opacity duration-300", isCuriosityLoading && "opacity-60")}>
                    {promptSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrompt(suggestion);
                        }}
                        disabled={isCuriosityLoading}
                        title={suggestion}
                        className="arcade-btn inline-flex items-center gap-2 px-3 py-1.5 bg-[#16161a] hover:bg-[#1f1f26] border border-[#27272a] text-xs font-mono text-[#A1A1AA] hover:text-[#F4F4F5] transition-all cursor-pointer max-w-[280px] sm:max-w-[340px] disabled:cursor-not-allowed"
                      >
                        <span className="text-[#3b82f6] font-bold">&gt;</span>
                        <span className="truncate">{suggestion}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── QUICK STARTER CHIPS (Solid Arcade Cartridges) ── */}
                <div className="flex flex-wrap items-center justify-center gap-2 w-full select-none">
                  {quickStarters.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (item.action) item.action();
                        setPrompt((prev) => (prev.trim() ? prev : item.prompt));
                      }}
                      className="arcade-btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#16161a] hover:bg-[#1f1f26] text-[#A1A1AA] hover:text-[#F4F4F5] border border-[#27272a] text-xs font-mono transition-all cursor-pointer"
                    >
                      {item.isNew && (
                        <span className="px-1 py-0.2 text-[8px] font-bold bg-[#1e3a8a] text-[#93c5fd] border border-[#2563eb] leading-none">
                          NEW
                        </span>
                      )}
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </main>

              {/* ── FOOTER ───────────────────────────────────────────────────────── */}
              <footer className="w-full py-2 flex items-center justify-center gap-3 text-xs text-[#71717A] border-t border-[#27272a]/40 shrink-0 select-none">
                <span>© 2026 Scout</span>
                <span>·</span>
                <span>Agentic deep research</span>
              </footer>
            </div>
          </DropZone>
        )}
      </div>

      {/* -- SOURCE MODALS -- */}
      {sourceModalType && modalTitles[sourceModalType] && (
        <Dialog open={Boolean(sourceModalType)} onOpenChange={(o) => !o && setSourceModalType(null)}>
          <DialogContent className="max-w-md bg-[#141416] border-[#27272a] text-[#F4F4F5] rounded-none">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#F4F4F5] text-sm">
                {modalTitles[sourceModalType].icon}
                {modalTitles[sourceModalType].title}
              </DialogTitle>
            </DialogHeader>

            <div className="px-6 py-3 flex flex-col gap-3">
              <p className="text-xs text-[#A1A1AA]">{modalTitles[sourceModalType].desc}</p>
              <Input
                autoFocus
                placeholder={modalTitles[sourceModalType].placeholder}
                value={sourceInputVal}
                onChange={(e) => setSourceInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (sourceInputVal.trim()) {
                      handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
                    }
                  }
                }}
                className="bg-[#18181b] border-[#27272a] text-[#F4F4F5] placeholder:text-[#71717A] text-xs focus:border-[#2563eb] rounded-none"
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSourceModalType(null)} className="text-xs text-[#A1A1AA] hover:text-[#F4F4F5] rounded-none">
                Cancel
              </Button>
              <Button
                disabled={!sourceInputVal.trim()}
                onClick={() => {
                  if (sourceInputVal.trim()) {
                    handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
                  }
                }}
                className="rounded-none bg-[#2563eb] text-white hover:bg-[#1d4ed8] text-xs"
              >
                Attach Source
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      </div>
    </TooltipProvider>
  );
}