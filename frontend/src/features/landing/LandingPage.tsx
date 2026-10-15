import React, { useState, useRef } from 'react';
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
  UserPlus,
  LogOut,
  MessageSquare,
  ArrowUpRight,
  Trash2,
  Loader2,
  Check,
  RotateCw,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, Session } from '@/api/sessions';
import { sourcesApi } from '@/api/sources';
import { knowledgeApi } from '@/api/knowledge';
import CuriosityMap from '@/components/memory/CuriosityMap';
import DeleteSessionDialog from '@/features/research/DeleteSessionDialog';
import LandingChatWindow from '@/features/landing/LandingChatWindow';
import LandingSessionsWindow from '@/features/landing/LandingSessionsWindow';
import LandingSourcesWindow from '@/features/landing/LandingSourcesWindow';
import { useAuth } from '@/features/auth/useAuth';
import { normalizeSourceTitle, formatSessionTitle, deriveInitialSessionTitle } from '@/lib/formatters';
import DropZone from '@/components/workspace/DropZone';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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

const SESSIONS_PAGE_SIZE = 20;

export default function LandingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, logout } = useAuth();

  const [prompt, setPrompt] = useState<string>('');
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(true);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);
  const [isSessionsListOpen] = useState<boolean>(true);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialChatPrompt, setInitialChatPrompt] = useState<string | null>(null);
  const [showSessionsGallery, setShowSessionsGallery] = useState<boolean>(false);
  const [showSourcesGallery, setShowSourcesGallery] = useState<boolean>(false);
  const [showGraphView, setShowGraphView] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarSentinelRef = useRef<HTMLDivElement>(null);

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

  const sessions = React.useMemo(
    () => sessionsData?.pages.flatMap((page) => page) ?? [],
    [sessionsData]
  );

  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 70 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  React.useEffect(() => {
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

  const hasMemoryPrompts = Boolean(isAuthenticated && curiosityData?.suggested_prompts && curiosityData.suggested_prompts.length > 0);
  const promptSuggestions = hasMemoryPrompts
    ? curiosityData!.suggested_prompts
    : [
      'Synthesize recent breakthroughs in Graph RAG',
      'Compare dense retrieval vs hybrid search',
      'Analyze multi-agent reasoning workflows',
    ];

  const handleNewChat = () => {
    setActiveSessionId(null);
    setInitialChatPrompt(null);
    setShowSessionsGallery(false);
    setShowSourcesGallery(false);
    setShowGraphView(false);
    setPrompt('');
    setAttachedSources([]);
    if (window.location.pathname !== '/') {
      navigate('/');
    }
  };

  const inferSourceType = (rawType: SourceType, urlOrContent: string): SourceType => {
    const u = urlOrContent.toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('github.com')) return 'github';
    if (u.endsWith('.pdf')) return 'pdf';
    return rawType;
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
      const created = await sourcesApi.createSource({
        url: urlOrName.startsWith('http') ? urlOrName : undefined,
        title,
        content: content || (!urlOrName.startsWith('http') ? urlOrName : undefined),
        source_type: type as any,
      });

      clearTimeout(timer);

      if (created?.status === 'indexed') {
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
      setAttachedSources((prev) =>
        prev.map((s) =>
          s.id === clientSourceId
            ? {
              ...s,
              status: 'failed',
              error: err?.response?.data?.detail || err?.message || 'Ingestion failed',
            }
            : s
        )
      );
    }
  };

  const handleAddSource = (type: SourceType, title: string, urlOrName: string, content?: string) => {
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

  const isAnySourceIndexing = attachedSources.some(
    (s) => s.status === 'extracting' || s.status === 'embedding'
  );

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
        setActiveSessionId(newSession.id);
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
    <div className="relative w-screen h-screen max-h-screen overflow-hidden bg-[#0d0d0f] text-[#F4F4F5] flex flex-col md:flex-row">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── SOLID DOCKED SIDEBAR (Pure Solid Grays + Blue Accents) ── */}
      <aside className="hidden md:flex flex-col justify-between w-[260px] lg:w-[280px] h-full bg-[#121215] border-r border-[#27272a] shrink-0 z-20 select-none font-mono">
        {/* Top Section: Brand Header, New Chat, & Navigation Tabs */}
        <div className="flex flex-col gap-2 p-3 pb-2 border-b border-[#27272a]">
          <div className="flex items-center justify-between px-1 mb-1">
            <Link
              to="/"
              onClick={handleNewChat}
              className="flex items-center gap-2 text-[#F4F4F5] no-underline hover:text-white transition-colors cursor-pointer group"
            >
              <span className="w-3 h-3 bg-[#3b82f6] border border-[#60a5fa] inline-block shadow-[1px_1px_0px_#000]" />
              <span className="font-arcade text-base tracking-wider text-[#F4F4F5] uppercase">Scout</span>
            </Link>
          </div>

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="arcade-btn flex items-center gap-2 w-full px-3 py-2 bg-[#18181c] hover:bg-[#202026] text-xs font-mono font-semibold text-[#F4F4F5] border border-[#27272a] hover:border-[#3b82f6] cursor-pointer"
          >
            <Plus size={13} className="text-[#3b82f6]" />
            <span className="truncate uppercase tracking-wider text-[11px]">[+ New Chat]</span>
          </button>

          {/* Sources Tab Button */}
          <button
            type="button"
            onClick={() => {
              setShowSourcesGallery(true);
              setShowSessionsGallery(false);
              setShowGraphView(false);
              setActiveSessionId(null);
            }}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-mono transition-colors cursor-pointer border",
              showSourcesGallery
                ? "text-white bg-[#1e293b] border-[#3b82f6] shadow-[2px_2px_0px_#2563eb] font-semibold"
                : "text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#16161a] border-[#27272a] hover:border-[#3f3f46]"
            )}
          >
            <Database
              size={14}
              className={cn("shrink-0 transition-colors", showSourcesGallery ? "text-[#3b82f6]" : "text-[#71717A]")}
            />
            <span className="truncate uppercase tracking-wider text-[11px]">Sources</span>
          </button>

          {/* Graph Tab Button */}
          <button
            type="button"
            onClick={() => {
              setShowGraphView(true);
              setShowSourcesGallery(false);
              setShowSessionsGallery(false);
              setActiveSessionId(null);
            }}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-mono transition-colors cursor-pointer border",
              showGraphView
                ? "text-white bg-[#1e293b] border-[#3b82f6] shadow-[2px_2px_0px_#2563eb] font-semibold"
                : "text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#16161a] border-[#27272a] hover:border-[#3f3f46]"
            )}
          >
            <Network
              size={14}
              className={cn("shrink-0 transition-colors", showGraphView ? "text-[#3b82f6]" : "text-[#71717A]")}
            />
            <span className="truncate uppercase tracking-wider text-[11px]">Graph Map</span>
          </button>
        </div>

        {/* ── SESSIONS LIST (Recent Chats) ── */}
        {isSessionsListOpen && (
          <div className="flex-1 min-h-0 flex flex-col w-full px-3 py-2 overflow-hidden">
            {/* Header: RECENT + View all */}
            <div className="flex items-center justify-between px-1 pb-2 shrink-0 select-none">
              <span className="text-[10px] font-semibold tracking-wider text-[#71717A] uppercase font-mono">
                Recent
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowSessionsGallery(true);
                  setShowSourcesGallery(false);
                  setShowGraphView(false);
                  setActiveSessionId(null);
                }}
                className="flex items-center gap-0.5 text-[10px] font-medium text-[#A1A1AA] hover:text-[#3b82f6] transition-colors cursor-pointer"
                title="View all research sessions"
              >
                <span>View all</span>
                <ArrowUpRight size={10} />
              </button>
            </div>

            {/* Scrollable list of chat sessions */}
            <div
              ref={sidebarScrollRef}
              onScroll={handleSidebarScroll}
              className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-0.5 sidebar-scroll"
            >
              {!isAuthenticated ? (
                <div className="py-6 px-2 text-center text-xs text-[#71717A]">
                  <BrainCircuit size={20} className="mx-auto mb-2 text-[#71717A]" />
                  <p className="text-[#A1A1AA] font-medium mb-1">Sign in to view chats</p>
                  <p className="text-[11px] text-[#71717A] mb-3">Keep track of your deep research</p>
                  <button
                    onClick={() => navigate('/login')}
                    className="px-3 py-1 rounded-none text-xs font-medium bg-[#18181b] hover:bg-[#202025] text-[#F4F4F5] border border-[#27272a] transition-colors cursor-pointer"
                  >
                    Log in
                  </button>
                </div>
              ) : isLoadingSessions ? (
                /* Loading skeletons */
                <div className="space-y-1 py-1 px-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 bg-[#18181b] border border-[#27272a] animate-pulse"
                    >
                      <div className="w-2 h-2 bg-[#27272a] shrink-0" />
                      <div className="h-2 bg-[#27272a] w-full" />
                    </div>
                  ))}
                </div>
              ) : !sessions || sessions.length === 0 ? (
                /* Empty state */
                <div className="py-6 px-2 text-center text-xs text-[#71717A]">
                  <MessageSquare size={18} className="mx-auto mb-2 text-[#71717A]" />
                  <p className="font-medium text-[#A1A1AA]">No recent chats</p>
                  <p className="text-[11px] text-[#71717A] mt-0.5 mb-3">Ask questions to start research</p>
                  <button
                    onClick={handleNewChat}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none text-xs font-medium bg-[#18181b] hover:bg-[#202025] text-[#F4F4F5] border border-[#27272a] transition-colors cursor-pointer"
                  >
                    <Plus size={12} className="text-[#3b82f6]" />
                    <span>Start chat</span>
                  </button>
                </div>
              ) : (
                /* Sessions items */
                <>
                  {sessions.map((session) => {
                    const isActive = activeSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setInitialChatPrompt(null);
                          setShowSessionsGallery(false);
                          setShowSourcesGallery(false);
                          setShowGraphView(false);
                        }}
                        title={formatSessionTitle(session.title)}
                        className={cn(
                          'group relative flex items-center justify-between w-full px-2.5 py-1.5 rounded-none text-xs transition-colors cursor-pointer select-none',
                          isActive
                            ? 'bg-[#202026] text-white border-l-2 border-l-[#2563eb] font-medium'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181b]'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <MessageSquare
                            size={13}
                            className={cn(
                              'shrink-0 transition-colors',
                              isActive ? 'text-[#3b82f6]' : 'text-[#71717A] group-hover:text-[#A1A1AA]'
                            )}
                          />
                          <span className="truncate">
                            {formatSessionTitle(session.title)}
                          </span>
                        </div>

                        {/* Quick delete icon on hover */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSessionToDelete(session);
                          }}
                          title="Delete chat"
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#71717A] hover:text-[#EF4444] hover:bg-[#202024] transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Scroll Sentinel for incremental load */}
                  <div ref={sidebarSentinelRef} className="h-1 w-full pointer-events-none" />

                  {/* Loading more indicator */}
                  {isFetchingNextPage && (
                    <div className="py-2 px-2 flex items-center justify-center gap-1.5 text-xs text-[#A1A1AA]">
                      <Loader2 size={12} className="animate-spin text-[#3b82f6] shrink-0" />
                      <span>Loading older chats...</span>
                    </div>
                  )}

                  {/* End of list indicator */}
                  {!hasNextPage && sessions.length >= SESSIONS_PAGE_SIZE && (
                    <div className="py-2 text-center text-[10px] text-[#52525B] select-none">
                      All chats loaded
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Bottom: Auth / Account Panel */}
        <div className="p-3 border-t border-[#27272a] bg-[#121214] shrink-0">
          {isAuthenticated ? (
            <div className="flex items-center justify-between w-full px-2 py-1.5 bg-[#18181b] border border-[#27272a]">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-none bg-[#202026] border border-[#27272a] flex items-center justify-center text-xs font-semibold text-[#3b82f6] shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-xs font-medium text-[#F4F4F5] truncate">
                  {user?.name || 'Account'}
                </span>
              </div>
              <button
                onClick={() => setShowLogoutModal(true)}
                title="Log out"
                className="p-1 text-[#71717A] hover:text-[#EF4444] hover:bg-[#202024] transition-colors cursor-pointer"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => navigate('/login')}
                className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] transition-colors cursor-pointer"
              >
                <LogIn size={13} />
                <span>Log In</span>
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] border border-[#2563eb] transition-colors cursor-pointer"
              >
                <UserPlus size={13} />
                <span>Get Started</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MOBILE TOP BAR (Only visible on small screens) ── */}
      <header className="md:hidden w-full flex items-center justify-between px-4 py-2.5 bg-[#141416] border-b border-[#27272a] shrink-0 z-20">
        <button
          onClick={handleNewChat}
          className="text-[#F4F4F5] no-underline flex items-center gap-2 cursor-pointer font-semibold text-base"
        >
          <span className="w-2 h-2 bg-[#2563eb]" />
          <span>Scout</span>
        </button>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setShowSessionsGallery(true);
                  setShowSourcesGallery(false);
                  setShowGraphView(false);
                  setActiveSessionId(null);
                }}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer',
                  showSessionsGallery
                    ? 'text-white bg-[#202026] border-[#2563eb]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#18181b] border-[#27272a]'
                )}
              >
                Sessions
              </button>
              <button
                onClick={() => {
                  setShowSourcesGallery(true);
                  setShowSessionsGallery(false);
                  setShowGraphView(false);
                  setActiveSessionId(null);
                }}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer',
                  showSourcesGallery
                    ? 'text-white bg-[#202026] border-[#2563eb]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#18181b] border-[#27272a]'
                )}
              >
                Sources
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate('/login')}
                className="px-2.5 py-1 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#18181b] border border-[#27272a]"
              >
                Log In
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-2.5 py-1 text-xs font-medium text-white bg-[#2563eb]"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── REST OF SCREEN: MAIN WORKSPACE (FULL WIDTH, CENTERED BEHAVIOR) ── */}
      <div className="flex-1 h-full min-w-0 flex flex-col bg-[#0d0d0f] relative overflow-hidden">
        {/* Animated Neon Arcade Background */}
        <NeonArcadeBackground />

        {activeSessionId ? (
          <LandingChatWindow
            sessionId={activeSessionId}
            initialPrompt={initialChatPrompt}
            onClose={() => {
              setActiveSessionId(null);
              setInitialChatPrompt(null);
            }}
            onSessionDeleted={() => {
              setActiveSessionId(null);
              setInitialChatPrompt(null);
            }}
          />
        ) : showSessionsGallery ? (
          <LandingSessionsWindow
            onSelectSession={(sessionId) => {
              setActiveSessionId(sessionId);
              setShowSessionsGallery(false);
              setShowSourcesGallery(false);
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
            else handleAddSource('web', content, content);
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
                <div className="w-full max-w-3xl flex flex-col gap-2">
                  <div className="relative w-full bg-[#1e1e24] border border-[#2f2f38] border-l-4 border-l-[#3b82f6] shadow-[4px_4px_0px_#000000] flex flex-col">

                    {/* Attached Sources Cartridges */}
                    {attachedSources.length > 0 && (
                      <div className="w-full border-b border-[#2a2a33] bg-[#16161a] p-3 flex flex-col gap-2">
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

                            return (
                              <span
                                key={source.id}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-none transition-colors font-mono',
                                  isExtracting && 'bg-[#18181b] border-amber-600/50 text-amber-300',
                                  isEmbedding && 'bg-[#14233c] border-[#2563eb] text-[#3b82f6]',
                                  isReady && 'bg-[#18181b] border-[#27272a] text-[#F4F4F5]',
                                  isFailed && 'bg-[#281010] border-red-700/60 text-red-300'
                                )}
                              >
                                {getSourceIcon(source.type)}

                                <span className="max-w-[160px] truncate" title={source.title}>
                                  {source.title}
                                </span>

                                {isExtracting && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                                    <Loader2 size={10} className="animate-spin text-amber-400 shrink-0" />
                                    <span>Extracting...</span>
                                  </span>
                                )}

                                {isEmbedding && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-[#3b82f6]">
                                    <Loader2 size={10} className="animate-spin text-[#3b82f6] shrink-0" />
                                    <span>Embedding...</span>
                                  </span>
                                )}

                                {isReady && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400">
                                    <Check size={10} className="stroke-[2.5]" />
                                    <span>{source.chunkCount || 1} chunks</span>
                                  </span>
                                )}

                                {isFailed && (
                                  <div className="inline-flex items-center gap-1">
                                    <span className="text-[10px] text-red-400">Failed</span>
                                    <button
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
                          <span className="flex items-center gap-1 text-[11px] text-[#3b82f6] font-mono">
                            <Loader2 size={10} className="animate-spin text-[#3b82f6]" />
                            <span>Indexing...</span>
                          </span>
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
                  <div className="flex items-center gap-1.5 select-none">
                    <span className="text-[10px] font-bold tracking-wider text-[#71717A] uppercase font-mono">
                      {hasMemoryPrompts ? '[SUGGESTED FROM MEMORY]' : '[SUGGESTED TOPICS]'}
                    </span>
                    {isAuthenticated && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const fresh = await knowledgeApi.getCuriosity(true);
                            queryClient.setQueryData(['curiosity'], fresh);
                          } catch {
                            refetchCuriosity();
                          }
                        }}
                        disabled={isFetchingCuriosity}
                        title="Refresh prompts from latest knowledge graph"
                        className="text-[#71717A] hover:text-[#3b82f6] p-0.5 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <RotateCw
                          size={10}
                          className={cn('transition-transform', isFetchingCuriosity && 'animate-spin text-[#3b82f6]')}
                        />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                    {promptSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrompt(suggestion);
                        }}
                        title={suggestion}
                        className="arcade-btn inline-flex items-center gap-2 px-3 py-1.5 bg-[#16161a] hover:bg-[#1f1f26] border border-[#27272a] text-xs font-mono text-[#A1A1AA] hover:text-[#F4F4F5] transition-all cursor-pointer max-w-[280px] sm:max-w-[340px]"
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

      {/* ── LOGOUT CONFIRMATION MODAL ── */}
      <Dialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
        <DialogContent className="max-w-sm bg-[#141416] border-[#27272a] text-[#F4F4F5] rounded-none">
          <DialogHeader>
            <div className="w-8 h-8 rounded-none bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-1 text-[#EF4444]">
              <LogOut size={16} />
            </div>
            <DialogTitle className="text-[#F4F4F5] text-sm font-semibold">
              Log out of Scout?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#A1A1AA] mt-0.5 leading-relaxed">
              Are you sure you want to end your session? Any unsaved drafts will remain preserved.
            </DialogDescription>
          </DialogHeader>

          {user && (
            <div className="px-6 py-2">
              <div className="flex items-center gap-2.5 p-2 bg-[#18181b] border border-[#27272a] rounded-none">
                <div className="w-7 h-7 rounded-none bg-[#202026] border border-[#27272a] flex items-center justify-center text-xs font-semibold text-[#3b82f6] shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-[#F4F4F5] truncate">
                    {user?.name || 'Account'}
                  </span>
                  {user?.email && (
                    <span className="text-[10px] text-[#71717A] truncate">
                      {user.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowLogoutModal(false)}
              className="rounded-none text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#202024] text-xs h-8 px-3 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowLogoutModal(false);
                logout();
              }}
              className="rounded-none bg-[#EF4444] text-white hover:bg-[#DC2626] text-xs font-medium h-8 px-3 cursor-pointer flex items-center gap-1.5"
            >
              <LogOut size={13} />
              <span>Log Out</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete session confirmation dialog */}
      <DeleteSessionDialog
        session={sessionToDelete}
        open={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onSuccess={() => {
          if (sessionToDelete && activeSessionId === sessionToDelete.id) {
            setActiveSessionId(null);
            setInitialChatPrompt(null);
          }
          setSessionToDelete(null);
        }}
      />
    </div>
  );
}