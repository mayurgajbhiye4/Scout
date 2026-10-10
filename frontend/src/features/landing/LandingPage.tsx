import React, { useState, useRef } from 'react';
import {
  Plus,
  ArrowUp,
  Youtube,
  FileText,
  Github,
  Globe,
  Brain,
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
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, Session } from '@/api/sessions';
import { sourcesApi } from '@/api/sources';
import { knowledgeApi } from '@/api/knowledge';
import CuriosityMap from '@/components/memory/CuriosityMap';
import DeleteSessionDialog from '@/features/research/DeleteSessionDialog';
import LandingChatWindow from '@/features/landing/LandingChatWindow';
import LandingSessionsWindow from '@/features/landing/LandingSessionsWindow';
import LandingSourcesWindow from '@/features/landing/LandingSourcesWindow';
import { useAuth } from '@/features/auth/useAuth';
import { normalizeSourceTitle } from '@/lib/formatters';
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

  const { data: sessions, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.listSessions(),
    enabled: isAuthenticated,
  });

  const { data: curiosityData } = useQuery({
    queryKey: ['curiosity'],
    queryFn: () => knowledgeApi.getCuriosity(),
    enabled: isAuthenticated,
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
          title: prompt.slice(0, 45) || 'Research Session',
          mode: reasoningEnabled ? 'research' : 'ask',
          source_policy: 'source_first',
          source_ids: readySourceIds.length > 0 ? readySourceIds : undefined,
        });

        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['sources'] });
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
    <div className="relative flex flex-col h-screen max-h-screen overflow-hidden bg-[#09090B] text-[#F4F4F5] selection:bg-[#D4D4D8]/20">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── SINGLE CENTER CIRCULAR GRADIENT (SOFT WHITE GLOW) ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Soft centered circular radial glow with expansive radius */}
        <div
          className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1400px] sm:w-[1800px] md:w-[2300px] lg:w-[2700px] h-[1400px] sm:h-[1800px] md:h-[2300px] lg:h-[2700px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.18) 0%, rgba(37, 99, 235, 0.09) 38%, rgba(37, 99, 235, 0.03) 62%, transparent 82%)',
            filter: 'blur(140px)',
          }}
        />

        {/* Subtle Tech Matrix/Dot Grid Overlay for crisp depth */}
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }}
        />

        {/* Linear Dark Vignette overlay so center content pops with maximum contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090B]/20 via-transparent to-[#09090B]/90" />
      </div>

      {/* ── MAIN LAYOUT: VERTICAL PILL SIDEBAR + HERO CONTENT (HERO DEAD CENTER) ── */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row items-center justify-center px-4 py-2 md:py-3 w-full max-w-[1520px] mx-auto gap-5 lg:gap-7">

        {/* ── EXPANDED VERTICAL PILL SIDEBAR (Gemini Style, Viewport Balanced) ── */}
        <aside
          className={cn(
            'hidden md:flex flex-col justify-between py-5 px-3 rounded-[34px] shrink-0',
            // Ultra-transparent crystal glass
            'bg-white/[0.01] border border-white/[0.08]',
            'backdrop-blur-[12px] -webkit-backdrop-blur-[12px]',
            'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.25)]',
            'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            // Flexible height that fits within the viewport without scrollbars
            'w-[250px] lg:w-[260px] h-full max-h-[1000px] my-auto'
          )}
        >
          {/* Top Section: Brand Header, New Chat, & Navigation Tabs */}
          <div className="flex flex-col gap-2 w-full shrink-0">
            <Link
              to="/"
              onClick={handleNewChat}
              className="flex items-center gap-2.5 px-2 py-1 text-[#F4F4F5] no-underline hover:opacity-85 transition-opacity select-none mb-1 cursor-pointer"
            >
              <span className="font-semibold text-2xl tracking-tight leading-none text-[#F4F4F5]">Scout</span>
            </Link>

            {/* New Chat Button */}
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-foreground text-xs font-medium border border-white/10 hover:border-white/20 transition-all shadow-xs active:scale-[0.98] cursor-pointer group mb-1"
            >
              <Plus size={15} className="text-[#E4E4E7] group-hover:rotate-90 transition-transform duration-200" />
              <span className="truncate">New chat</span>
            </button>

            {/* Sources Tab Button (placed below Sessions) */}
            <button
              type="button"
              onClick={() => {
                setShowSourcesGallery(true);
                setShowSessionsGallery(false);
                setShowGraphView(false);
                setActiveSessionId(null);
              }}
              className={cn(
                "flex items-center gap-3 w-full px-3.5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 active:scale-[0.98] select-none cursor-pointer group",
                showSourcesGallery
                  ? "text-[#F4F4F5] bg-white/[0.12] border border-white/15 shadow-xs font-semibold"
                  : "text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08]"
              )}
            >
              <Database
                size={17}
                className={cn(
                  "shrink-0 transition-colors",
                  showSourcesGallery ? "text-[#E4E4E7]" : "text-[#A1A1AA] group-hover:text-[#F4F4F5]"
                )}
              />
              <span className="truncate">Sources</span>
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
                "flex items-center gap-3 w-full px-3.5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 active:scale-[0.98] select-none cursor-pointer group",
                showGraphView
                  ? "text-[#F4F4F5] bg-white/[0.12] border border-white/15 shadow-xs font-semibold"
                  : "text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08]"
              )}
            >
              <Network
                size={17}
                className={cn(
                  "shrink-0 transition-colors",
                  showGraphView ? "text-sky-400" : "text-[#A1A1AA] group-hover:text-[#F4F4F5]"
                )}
              />
              <span className="truncate">Graph</span>
            </button>
          </div>

          {/* ── SESSIONS LIST (Below Sources Tab, Gemini Style) ── */}
          {isSessionsListOpen && (
            <div className="flex-1 min-h-0 flex flex-col w-full my-2 pt-2.5 border-t border-white/[0.06] overflow-hidden animate-in fade-in duration-200">
              {/* Header: RECENT + View all */}
              <div className="flex items-center justify-between px-2 pb-1.5 shrink-0 select-none">
                <span className="text-[11px] font-semibold tracking-wider text-[#71717A] uppercase">
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
                  className="flex items-center gap-0.5 text-[11px] font-medium text-[#A1A1AA] hover:text-[#E4E4E7] transition-colors group/all cursor-pointer"
                  title="View all research sessions"
                >
                  <span>View all</span>
                  <ArrowUpRight size={11} className="group-hover/all:translate-x-0.5 group-hover/all:-translate-y-0.5 transition-transform" />
                </button>
              </div>

              {/* Scrollable list of chat sessions */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 sidebar-scroll">
                {!isAuthenticated ? (
                  <div className="py-6 px-2 text-center text-xs text-[#71717A]">
                    <BrainCircuit size={22} className="mx-auto mb-2 opacity-40 text-[#A1A1AA]" />
                    <p className="text-[#A1A1AA] font-medium mb-1">Sign in to view chats</p>
                    <p className="text-[11px] text-[#71717A] mb-3">Keep track of your deep research</p>
                    <button
                      onClick={() => navigate('/login')}
                      className="px-3 py-1 rounded-full text-[11px] font-medium bg-white/[0.08] hover:bg-white/[0.14] text-[#F4F4F5] border border-white/10 transition-colors cursor-pointer"
                    >
                      Log in
                    </button>
                  </div>
                ) : isLoadingSessions ? (
                  /* Loading skeletons */
                  <div className="space-y-1.5 py-1 px-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04] animate-pulse"
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-white/10 shrink-0" />
                        <div className="h-2.5 bg-white/10 rounded w-full" />
                      </div>
                    ))}
                  </div>
                ) : !sessions || sessions.length === 0 ? (
                  /* Empty state */
                  <div className="py-6 px-2 text-center text-xs text-[#71717A]">
                    <MessageSquare size={20} className="mx-auto mb-2 opacity-40 text-[#A1A1AA]" />
                    <p className="font-medium text-[#A1A1AA]">No recent chats</p>
                    <p className="text-[11px] text-[#71717A] mt-0.5 mb-3">Ask questions to start research</p>
                    <button
                      onClick={handleNewChat}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-[#F4F4F5] border border-white/10 transition-all cursor-pointer active:scale-95"
                    >
                      <Plus size={11} className="text-[#E4E4E7]" />
                      <span>Start chat</span>
                    </button>
                  </div>
                ) : (
                  /* Sessions items */
                  sessions.map((session) => {
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
                        title={session.title || 'Untitled Session'}
                        className={cn(
                          'group relative flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none active:scale-[0.98]',
                          isActive
                            ? 'bg-white/[0.14] text-[#F4F4F5] border border-white/15 font-medium shadow-xs'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.07] border border-transparent'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <MessageSquare
                            size={13}
                            className={cn(
                              'shrink-0 transition-colors',
                              isActive ? 'text-[#E4E4E7]' : 'text-[#71717A] group-hover:text-[#E4E4E7]'
                            )}
                          />
                          <span className="truncate transition-all">
                            {session.title || 'Untitled Session'}
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
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.08] transition-all shrink-0 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Bottom: Auth / Action Buttons */}
          <div className="flex flex-col gap-2 w-full shrink-0 pt-3 border-t border-white/[0.06]">
            {isAuthenticated ? (
              <div className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-medium text-[#F4F4F5] shrink-0">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-xs font-medium text-[#F4F4F5] truncate">
                    {user?.name || 'Account'}
                  </span>
                </div>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  title="Log out"
                  className="p-1 rounded-full text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] rounded-full active:scale-[0.98] transition-all cursor-pointer"
                >
                  <LogIn size={14} />
                  <span>Log In</span>
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-semibold text-black bg-white rounded-full shadow-[0_2px_10px_rgba(255,255,255,0.18)] hover:bg-[#F4F4F5] hover:shadow-[0_4px_16px_rgba(255,255,255,0.25)] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Get Started</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* ── MOBILE TOP BAR (Only visible on mobile screens) ── */}
        <header className="md:hidden w-full flex justify-center pt-2 pb-4 pointer-events-none">
          <nav
            className={cn(
              'pointer-events-auto flex items-center justify-between gap-4 px-4 py-2 rounded-full',
              'bg-white/[0.01] border border-white/[0.08]',
              'backdrop-blur-[12px] -webkit-backdrop-blur-[12px]',
              'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.25)]',
              'w-full max-w-[480px]'
            )}
          >
            <button
              onClick={handleNewChat}
              className="text-[#F4F4F5] no-underline flex items-center gap-2 cursor-pointer"
            >
              <Sparkles size={16} className="text-[#E4E4E7]" />
              <span className="font-semibold text-lg tracking-tight">Scout</span>
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
                      'px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer',
                      showSessionsGallery
                        ? 'text-[#F4F4F5] bg-white/[0.18] border border-white/25 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.06] border border-white/10'
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
                      'px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer',
                      showSourcesGallery
                        ? 'text-[#F4F4F5] bg-white/[0.18] border border-white/25 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-[#F4F4F5] bg-white/[0.06] border border-white/10'
                    )}
                  >
                    Sources
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="px-3 py-1 text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5]"
                  >
                    Log In
                  </button>
                  <button
                    onClick={() => navigate('/register')}
                    className="px-3 py-1 text-xs font-semibold text-black bg-white rounded-full"
                  >
                    Get Started
                  </button>
                </>
              )}
            </div>
          </nav>
        </header>

        {/* ── CENTER COLUMN: CHAT WINDOW, SESSIONS GALLERY, SOURCES GALLERY, OR HERO PROMPT STUDIO ── */}
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
          /* ── HERO + KNOWLEDGE INBOX CENTER COLUMN ── */
          <DropZone onDropSource={(content, type) => {
            if (type === 'file') handleAddSource('pdf', content, content);
            else handleAddSource('web', content, content);
          }}>
            <main className="w-full max-w-[680px] flex flex-col items-center gap-5 animate-fade-in-up">

              {/* Badge */}
              <span className="inline-flex items-center gap-2 px-3 py-0.5 bg-[#111114]/90 backdrop-blur-md border border-[#27272A] rounded-full text-[11px] font-medium text-[#A1A1AA] tracking-wide uppercase shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                Grounded Deep Research
              </span>


              {/* ── UNIFIED KNOWLEDGE & PROMPT STUDIO BOX ─────────────────── */}
              <div className="w-full rounded-[28px] border border-sky-400/40 bg-[#111114]/90 backdrop-blur-[16px] transition-all duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-sky-400/65 focus-within:border-sky-400 focus-within:shadow-[0_0_0_2px_rgba(56,189,248,0.25),0_0_36px_rgba(56,189,248,0.18),0_16px_48px_rgba(0,0,0,0.7)] overflow-hidden shadow-[0_0_24px_rgba(56,189,248,0.10),0_8px_32px_rgba(0,0,0,0.4)]">
                {/* ── TOP SECTION: KNOWLEDGE INBOX ── */}
                <div className="w-full border-b border-sky-400/20 bg-transparent">
                  {/* ── EMPTY STATE (when no sources attached) ── */}
                  {attachedSources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-6 select-none">
                      <h2 className="text-base font-semibold text-[#F4F4F5] tracking-[-0.01em] mb-1">
                        {/* Headline */}
                        <div className="text-center space-y-1.5">
                          <h1 className="text-[1.85rem] sm:text-[2.25rem] md:text-[2.65rem] font-bold text-[#F4F4F5] tracking-[-0.02em] leading-[1.14]">
                            Drop your future knowledge.
                          </h1>
                          <p className="text-[#A1A1AA] text-xs sm:text-sm max-w-[480px] mx-auto leading-relaxed">
                            Drop a link, file, or question. Scout's agent reasons, retrieves, and synthesizes evidence-backed reports.
                          </p>
                        </div>
                      </h2>



                      <p className="text-[#71717A] text-sm mb-4">
                        <kbd className="px-1.5 py-0.5 rounded bg-[#1C1C22] border border-[#27272A] text-[#A1A1AA] text-[11px] font-mono font-medium mr-0.5">Ctrl</kbd>
                        <span className="text-[#52525B] mx-0.5">+</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-[#1C1C22] border border-[#27272A] text-[#A1A1AA] text-[11px] font-mono font-medium mr-1.5">V</kbd>
                        to paste a URL, article, or text snippet
                      </p>

                      {/* Suggested Prompts as Interactive Pills */}
                      <div className="flex flex-col items-center gap-2.5 w-full max-w-[680px] mt-3.5 pt-1">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#71717A] uppercase select-none">
                          <Sparkles size={11} className="text-sky-400" />
                          {hasMemoryPrompts ? 'Suggested from your memory' : 'Suggested prompts'}
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {promptSuggestions.map((suggestion, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrompt(suggestion);
                              }}
                              title={suggestion}
                              className="group inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#141418]/90 hover:bg-[#1E1E24] border border-[#27272A] hover:border-sky-400/40 rounded-full text-xs text-[#A1A1AA] hover:text-[#F4F4F5] shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_14px_rgba(56,189,248,0.12)] transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] hover:-translate-y-0.5 cursor-pointer max-w-[280px] sm:max-w-[340px]"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70 group-hover:bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)] group-hover:shadow-[0_0_8px_rgba(56,189,248,0.8)] transition-all shrink-0" />
                              <span className="truncate">{suggestion}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── POPULATED STATE (sources added) ── */
                    <div className="flex flex-col gap-3 p-5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold tracking-wider text-[#71717A] uppercase">
                          Knowledge Sources
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-[#52525B] bg-[#1C1C22] border border-[#27272A] rounded-full px-2 py-0.5">
                            {attachedSources.length} added
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setAttachedSources([]); }}
                            className="text-[10px] font-medium text-[#71717A] hover:text-[#EF4444] transition-colors cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {attachedSources.map((source) => {
                          const isExtracting = source.status === 'extracting';
                          const isEmbedding = source.status === 'embedding';
                          const isReady = source.status === 'ready';
                          const isFailed = source.status === 'failed';

                          return (
                            <span
                              key={source.id}
                              className={cn(
                                'relative inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium transition-all duration-200 overflow-hidden select-none',
                                isExtracting && 'bg-amber-500/[0.08] border border-amber-500/30 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.12)]',
                                isEmbedding && 'bg-sky-500/[0.09] border border-sky-400/40 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.18)]',
                                isReady && 'bg-emerald-500/[0.08] border border-emerald-500/30 text-[#F4F4F5] hover:border-emerald-500/50 shadow-sm',
                                isFailed && 'bg-red-500/[0.08] border border-red-500/40 text-red-200'
                              )}
                            >
                              {getSourceIcon(source.type)}

                              <span className="max-w-[170px] truncate" title={source.title}>
                                {source.title}
                              </span>

                              {/* Progress / Status Badges */}
                              {isExtracting && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-400/15 px-2 py-0.5 rounded-full animate-pulse">
                                  <Loader2 size={10} className="animate-spin text-amber-400 shrink-0" />
                                  <span>Extracting...</span>
                                </span>
                              )}

                              {isEmbedding && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 bg-sky-400/15 px-2 py-0.5 rounded-full animate-pulse">
                                  <Loader2 size={10} className="animate-spin text-sky-400 shrink-0" />
                                  <span>Embedding...</span>
                                </span>
                              )}

                              {isReady && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                  <Check size={10} className="stroke-[2.5]" />
                                  <span>{source.chunkCount || 1} chunks ready</span>
                                </span>
                              )}

                              {isFailed && (
                                <div className="inline-flex items-center gap-1">
                                  <AlertCircle size={12} className="text-red-400 shrink-0" />
                                  <span
                                    className="text-[10px] font-medium text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full"
                                    title={source.error || 'Failed to index'}
                                  >
                                    Failed
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRetrySource(source.id);
                                    }}
                                    title="Retry indexing"
                                    className="text-zinc-400 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                                  >
                                    <RotateCw size={11} />
                                  </button>
                                </div>
                              )}

                              {/* Remove button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSource(source.id);
                                }}
                                title="Remove source"
                                className="text-[#71717A] hover:text-[#EF4444] transition-colors rounded-full p-0.5 ml-0.5 cursor-pointer"
                              >
                                <X size={12} />
                              </button>

                              {/* Subtle progress indicator bar for pending operations */}
                              {(isExtracting || isEmbedding) && (
                                <div
                                  className={cn(
                                    'absolute bottom-0 left-0 h-[2px] transition-all duration-700 ease-out',
                                    isExtracting
                                      ? 'w-1/3 bg-gradient-to-r from-amber-400 to-amber-500'
                                      : 'w-3/4 bg-gradient-to-r from-sky-400 to-blue-500'
                                  )}
                                />
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── BOTTOM SECTION: PROMPT BAR ── */}
                <div className="w-full bg-transparent overflow-hidden">
                  {/* Textarea — auto-grows with content */}
                  <textarea
                    rows={2}
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your sources…"
                    className="w-full border-none outline-none resize-none font-[inherit] text-[14px] leading-relaxed text-[#F4F4F5] bg-transparent placeholder:text-[#52525B] px-4 pt-3.5 pb-1"
                  />

                  {/* Bottom action row */}
                  <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
                    <div className="flex items-center gap-2">
                      {/* Attach source dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 rounded-lg text-[#71717A] hover:text-[#F4F4F5] hover:bg-white/[0.06] transition-colors active:scale-95 shrink-0"
                            title="Attach Source"
                          >
                            <Plus size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" className="min-w-[210px] bg-[#17171C] border-[#27272A] text-[#F4F4F5] shadow-2xl">
                          <DropdownMenuItem onClick={() => setSourceModalType('youtube')} className="hover:bg-[#27272A] focus:bg-[#27272A] cursor-pointer">
                            <Youtube size={15} className="text-[#EF4444]" /> Add YouTube Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="hover:bg-[#27272A] focus:bg-[#27272A] cursor-pointer">
                            <FileText size={15} className="text-[#F59E0B]" /> Upload PDF / Document
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSourceModalType('github')} className="hover:bg-[#27272A] focus:bg-[#27272A] cursor-pointer">
                            <Github size={15} className="text-[#A855F7]" /> Add GitHub Repository
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSourceModalType('docs')} className="hover:bg-[#27272A] focus:bg-[#27272A] cursor-pointer">
                            <Globe size={15} className="text-[#E4E4E7]" /> Add Docs / Website URL
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Reasoning toggle */}
                      <button
                        onClick={() => setReasoningEnabled(!reasoningEnabled)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-[150ms] ease-[cubic-bezier(0.16,1,0.3,1)] select-none active:scale-[0.97] cursor-pointer shrink-0',
                          reasoningEnabled
                            ? 'bg-[#1C1C22] border-[#3F3F46] text-[#F4F4F5] shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
                            : 'bg-transparent border-[#27272A] text-[#71717A] hover:text-[#A1A1AA] hover:border-[#3F3F46]'
                        )}
                      >
                        <Brain size={12} className={reasoningEnabled ? 'text-[#E4E4E7]' : 'text-[#71717A]'} />
                        Think
                      </button>

                      {/* Embeddings in-flight indicator */}
                      {isAnySourceIndexing && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-300 text-[11px] font-medium animate-pulse">
                          <Loader2 size={11} className="animate-spin text-sky-400" />
                          <span>Generating embeddings into vector store...</span>
                        </div>
                      )}
                    </div>

                    {/* Send button */}
                    <button
                      onClick={() => handleSubmit()}
                      disabled={!canSubmit || isSubmitting || isAnySourceIndexing}
                      aria-label="Run Research"
                      title={
                        isAnySourceIndexing
                          ? 'Generating vector embeddings for attached source(s)... Send is temporarily disabled'
                          : canSubmit
                          ? 'Send message'
                          : 'Enter a prompt or wait for sources'
                      }
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-[150ms] ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 select-none',
                        canSubmit && !isSubmitting && !isAnySourceIndexing
                          ? 'bg-[#F4F4F5] text-[#09090B] shadow-[0_2px_10px_rgba(255,255,255,0.18)] hover:scale-105 hover:bg-white active:scale-[0.97] cursor-pointer'
                          : 'bg-[#1C1C22] text-[#52525B] border border-[#27272A] cursor-not-allowed opacity-50'
                      )}
                    >
                      {isSubmitting || isAnySourceIndexing ? (
                        <Loader2 size={14} className="animate-spin text-sky-400" />
                      ) : (
                        <ArrowUp size={14} className={canSubmit ? 'text-black stroke-[2.5]' : 'text-[#52525B]'} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── QUICK STARTER PILLS ──────────────────────────────────────── */}
              <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                {quickStarters.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (item.action) item.action();
                      setPrompt((prev) => (prev.trim() ? prev : item.prompt));
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#111114] text-[#71717A] border border-[#1C1C22] rounded-full text-[11px] font-medium transition-all duration-[150ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#3F3F46] hover:text-[#A1A1AA] hover:bg-[#1C1C22] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.5)] active:scale-[0.97] cursor-pointer"
                  >
                    {item.isNew && (
                      <span className="px-1.5 py-0.5 text-[8px] font-bold bg-[#10B981]/15 text-[#10B981] rounded-full leading-none tracking-wide">
                        NEW
                      </span>
                    )}
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </main>
          </DropZone>
        )}

        {/* ── RIGHT BALANCING SPACER (Counterbalances sidebar so hero stays dead-center) ── */}
        <div
          className="hidden md:block w-[250px] lg:w-[260px] shrink-0 pointer-events-none"
          style={{ maxWidth: 'calc((100vw - 760px - 3.5rem) / 2)' }}
          aria-hidden="true"
        />
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 flex items-center justify-center gap-4 py-2 shrink-0">
        <span className="text-[#3F3F46] text-[11px]">© 2026 Scout</span>
        <span className="text-[#27272A] text-[11px]">·</span>
        <span className="text-[#3F3F46] text-[11px]">Agentic deep research</span>
      </footer>


      {/* -- SOURCE MODALS -- */}
      {sourceModalType && modalTitles[sourceModalType] && (
        <Dialog open={Boolean(sourceModalType)} onOpenChange={(o) => !o && setSourceModalType(null)}>
          <DialogContent className="max-w-md bg-[#17171C] border-[#27272A] text-[#F4F4F5] shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#F4F4F5]">
                {modalTitles[sourceModalType].icon}
                {modalTitles[sourceModalType].title}
              </DialogTitle>
            </DialogHeader>

            <div className="px-6 py-3 flex flex-col gap-4">
              <p className="text-sm text-[#A1A1AA]">{modalTitles[sourceModalType].desc}</p>
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
                className="bg-[#111114] border-[#27272A] text-[#F4F4F5] placeholder:text-[#71717A] focus:border-[#52525B]"
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSourceModalType(null)} className="text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06]">
                Cancel
              </Button>
              <Button
                disabled={!sourceInputVal.trim()}
                onClick={() => {
                  if (sourceInputVal.trim()) {
                    handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
                  }
                }}
                className="rounded-full bg-white text-black hover:bg-[#E4E4E7]"
              >
                Attach Source
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── LOGOUT CONFIRMATION MODAL ── */}
      <Dialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
        <DialogContent className="max-w-sm bg-[#17171C] border-[#27272A] text-[#F4F4F5] shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-1 text-[#EF4444]">
              <LogOut size={18} />
            </div>
            <DialogTitle className="text-[#F4F4F5] text-base font-semibold">
              Log out of Scout?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#A1A1AA] mt-0.5 leading-relaxed">
              Are you sure you want to end your session? Any unsaved prompt drafts will remain preserved in your local browser storage.
            </DialogDescription>
          </DialogHeader>

          {user && (
            <div className="px-6 py-2">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-semibold text-[#F4F4F5] shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-[#F4F4F5] truncate">
                    {user?.name || 'Account'}
                  </span>
                  {user?.email && (
                    <span className="text-[11px] text-[#71717A] truncate">
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
              className="rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] text-xs h-9 px-4 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowLogoutModal(false);
                logout();
              }}
              className="rounded-full bg-[#EF4444] text-white hover:bg-[#DC2626] active:scale-95 transition-all text-xs font-semibold h-9 px-4 shadow-[0_2px_12px_rgba(239,68,68,0.25)] cursor-pointer flex items-center gap-2"
            >
              <LogOut size={14} />
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