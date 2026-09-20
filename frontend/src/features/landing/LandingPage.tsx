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
  LogIn,
  UserPlus,
  LogOut,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
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

interface AttachedSource {
  id: string;
  type: SourceType;
  title: string;
  urlOrName: string;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const [prompt, setPrompt] = useState<string>('');
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(true);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = prompt.trim() || attachedSources.length > 0;

  const handleAddSource = (type: SourceType, title: string, urlOrName: string) => {
    setAttachedSources((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 9), type, title, urlOrName },
    ]);
    setSourceModalType(null);
    setSourceInputVal('');
  };

  const handleRemoveSource = (id: string) => {
    setAttachedSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAddSource('pdf', file.name, file.name);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    const draft = { prompt, reasoningEnabled, sources: attachedSources };
    sessionStorage.setItem('airw_landing_draft', JSON.stringify(draft));
    navigate(isAuthenticated ? '/sessions' : '/register', { state: { draft } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'youtube': return <Youtube size={13} className="text-[#EF4444]" />;
      case 'pdf':     return <FileText size={13} className="text-[#F59E0B]" />;
      case 'github':  return <Github size={13} className="text-[#A855F7]" />;
      default:        return <Globe size={13} className="text-[#38BDF8]" />;
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
      icon: <Globe size={13} className="text-[#38BDF8]" />,
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
      icon: <Globe size={20} className="text-[#38BDF8]" />,
      title: 'Add Documentation / Web Link',
      desc: 'Paste any web page or documentation link to extract and ground answers against it.',
      placeholder: 'https://docs.example.com',
    },
  };

  return (
    <div className="relative flex flex-col h-screen max-h-screen overflow-hidden bg-[#08080B] text-[#F4F4F5] selection:bg-[#3B82F6]/30">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── SINGLE CENTER CIRCULAR GRADIENT (DEEP DARK BLUE GLOW) ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Soft centered circular radial glow with larger radius & darker blue */}
        <div 
          className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[950px] sm:w-[1300px] md:w-[1600px] h-[950px] sm:h-[1300px] md:h-[1600px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(29, 78, 216, 0.22) 0%, rgba(30, 64, 175, 0.15) 28%, rgba(30, 58, 138, 0.08) 52%, transparent 75%)',
            filter: 'blur(100px)',
          }}
        />

        {/* Subtle Tech Matrix/Dot Grid Overlay for crisp depth */}
        <div 
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.20) 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }}
        />

        {/* Linear Dark Vignette overlay so center content pops with maximum contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080B]/20 via-transparent to-[#08080B]/90" />
      </div>

      {/* ── MAIN LAYOUT: VERTICAL PILL SIDEBAR + HERO CONTENT (HERO DEAD CENTER) ── */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row items-center justify-center px-4 py-2 md:py-3 w-full max-w-[1320px] mx-auto gap-5 lg:gap-7">
        
        {/* ── EXPANDED VERTICAL PILL SIDEBAR (Gemini Style, Viewport Balanced) ── */}
        <aside
          className={cn(
            'hidden md:flex flex-col justify-between py-5 px-3 rounded-[34px] shrink-0',
            // Liquid glass base
            'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
            'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
            'shadow-[var(--pill-shadow)]',
            'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            'hover:bg-[var(--pill-hover-bg)] hover:border-[var(--pill-hover-border)]',
            'hover:shadow-[var(--pill-hover-shadow)]',
            // Flexible height that fits within the viewport without scrollbars
            'w-[240px] h-full max-h-[1000px] my-auto'
          )}
        >
          {/* Top Section: Brand Header, New Chat, & Navigation Tabs */}
          <div className="flex flex-col gap-2 w-full">
            <Link
              to="/"
              className="flex items-center gap-2.5 px-2 py-1 text-[#F4F4F5] no-underline hover:opacity-85 transition-opacity select-none mb-1"
            >
              <div className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles size={16} className="text-[#38BDF8]" />
              </div>
              <span className="font-semibold text-lg tracking-tight leading-none text-[#F4F4F5]">Scout</span>
            </Link>

            {/* New Chat Button */}
            <button
              onClick={() => navigate('/sessions')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-foreground text-xs font-medium border border-white/10 hover:border-white/20 transition-all shadow-xs active:scale-[0.98] cursor-pointer group mb-1"
            >
              <Plus size={15} className="text-[#38BDF8] group-hover:rotate-90 transition-transform duration-200" />
              <span className="truncate">New chat</span>
            </button>

            {/* Sessions Tab Button (placed below New Chat) */}
            <Link
              to="/sessions"
              className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-full text-sm font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] transition-all duration-200 active:scale-[0.98] select-none cursor-pointer group"
            >
              <BrainCircuit size={17} className="text-[#A1A1AA] group-hover:text-[#F4F4F5] shrink-0 transition-colors" />
              <span className="truncate">Sessions</span>
            </Link>

            {/* Sources Tab Button (placed below Sessions) */}
            <Link
              to="/sources"
              className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-full text-sm font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] transition-all duration-200 active:scale-[0.98] select-none cursor-pointer group"
            >
              <Database size={17} className="text-[#A1A1AA] group-hover:text-[#F4F4F5] shrink-0 transition-colors" />
              <span className="truncate">Sources</span>
            </Link>
          </div>

          {/* Bottom: Auth / Action Buttons */}
          <div className="flex flex-col gap-2 w-full pt-3 border-t border-white/[0.06]">
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
              'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
              'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
              'shadow-[var(--pill-shadow)]',
              'w-full max-w-[480px]'
            )}
          >
            <Link to="/" className="text-[#F4F4F5] no-underline flex items-center gap-2">
              <Sparkles size={16} className="text-[#38BDF8]" />
              <span className="font-semibold text-lg tracking-tight">Scout</span>
            </Link>
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <button
                  onClick={() => navigate('/sessions')}
                  className="px-3 py-1 text-xs font-medium text-[#F4F4F5] bg-white/10 border border-white/[0.12] rounded-full"
                >
                  Sessions
                </button>
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

        {/* ── HERO + PROMPT CENTER COLUMN ── */}
        <main className="flex-1 min-h-0 w-full max-w-[720px] flex flex-col items-center justify-center gap-4 sm:gap-5 animate-fade-in-up my-auto">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 px-3 py-0.5 bg-[#111114]/90 backdrop-blur-md border border-[#27272A] rounded-full text-[11px] font-medium text-[#A1A1AA] tracking-wide uppercase shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            Autonomous Deep Research
          </span>

          {/* Headline */}
          <div className="text-center space-y-1.5">
            <h1 className="text-[1.85rem] sm:text-[2.25rem] md:text-[2.65rem] font-bold text-[#F4F4F5] tracking-[-0.02em] leading-[1.14]">
              Drop your future knowledge.
            </h1>
            <p className="text-[#A1A1AA] text-xs sm:text-sm max-w-[480px] mx-auto leading-relaxed">
              Drop a link, file, or question. Scout's agent reasons, retrieves, and synthesizes evidence-backed reports.
            </p>
          </div>

          {/* ── PROMPT CARD — Pill Shaped Matte Elevated Surface ──────────────────────── */}
          <div className="w-full rounded-[28px] sm:rounded-[32px] border border-[#27272A] bg-[#111114]/90 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)] transition-all duration-200 hover:border-[#3F3F46] hover:shadow-[0_16px_48px_rgba(0,0,0,0.75)] focus-within:border-[#52525B] focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.2),0_20px_56px_-8px_rgba(0,0,0,0.85)] overflow-hidden">
            {/* Attached source chips */}
            {attachedSources.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 pt-4">
                {attachedSources.map((source) => (
                  <span
                    key={source.id}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-[#1C1C22] border border-[#27272A] rounded-full text-xs text-[#F4F4F5] font-medium shadow-sm transition-colors hover:border-[#3F3F46]"
                  >
                    {getSourceIcon(source.type)}
                    <span className="max-w-[160px] truncate">{source.title}</span>
                    <button
                      onClick={() => handleRemoveSource(source.id)}
                      className="ml-0.5 text-[#71717A] hover:text-[#EF4444] transition-colors rounded-full p-0.5"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Textarea */}
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Drop a link, upload a file, or ask a research question…"
              className="w-full border-none outline-none resize-none font-[inherit] text-[14px] sm:text-[15px] leading-relaxed text-[#F4F4F5] bg-transparent placeholder:text-[#71717A] px-5 pt-3.5 pb-2"
            />

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-4 pb-2.5 pt-1 border-t border-white/[0.04] flex-wrap gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* + Attach dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-2 rounded-lg bg-[#1C1C22] border border-[#27272A] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] hover:border-[#3F3F46] transition-colors active:scale-95"
                      title="Attach Source"
                    >
                      <Plus size={15} />
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
                      <Globe size={15} className="text-[#38BDF8]" /> Add Docs / Website URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Quick icon shortcuts */}
                {[
                  { icon: <Youtube size={15} className="text-[#EF4444]" />, label: 'YouTube', action: () => setSourceModalType('youtube') },
                  { icon: <FileText size={15} className="text-[#F59E0B]" />, label: 'PDF',     action: () => fileInputRef.current?.click() },
                  { icon: <Github size={15} className="text-[#A855F7]" />,  label: 'GitHub',  action: () => setSourceModalType('github') },
                  { icon: <Globe size={15} className="text-[#38BDF8]" />,   label: 'Web/Doc', action: () => setSourceModalType('docs') },
                ].map(({ icon, label, action }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={action}
                    className="p-2 rounded-lg text-[#71717A] hover:text-[#F4F4F5] hover:bg-white/[0.06] active:scale-90 transition-all duration-150"
                  >
                    {icon}
                  </button>
                ))}

                {/* Reasoning toggle */}
                <button
                  onClick={() => setReasoningEnabled(!reasoningEnabled)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all duration-200 ml-1 select-none active:scale-95',
                    reasoningEnabled
                      ? 'bg-[#818CF8]/15 border-[#818CF8]/40 text-[#818CF8] shadow-[0_0_12px_rgba(129,140,248,0.15)]'
                      : 'bg-transparent border-[#27272A] text-[#71717A] hover:text-[#A1A1AA] hover:border-[#3F3F46] hover:bg-white/[0.04]'
                  )}
                >
                  <Brain size={13} className={reasoningEnabled ? 'text-[#818CF8]' : 'text-[#71717A]'} />
                  Reasoning
                </button>
              </div>

              {/* Send button */}
              <button
                onClick={() => handleSubmit()}
                disabled={!canSubmit}
                aria-label="Run Research"
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 select-none',
                  canSubmit
                    ? 'bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.22)] hover:scale-105 hover:bg-[#F4F4F5] active:scale-95 cursor-pointer'
                    : 'bg-[#1C1C22] text-[#71717A] border border-[#27272A] cursor-not-allowed opacity-50'
                )}
              >
                <ArrowUp size={16} className={canSubmit ? 'text-black stroke-[2.5]' : 'text-[#71717A]'} />
              </button>
            </div>
          </div>

          {/* ── QUICK STARTER PILLS ──────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            {quickStarters.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (item.action) item.action();
                  setPrompt((prev) => (prev ? `${prev} ${item.prompt}` : item.prompt));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#111114] text-[#A1A1AA] border border-[#27272A] rounded-full text-[11px] font-medium shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-[#3F3F46] hover:text-[#F4F4F5] hover:bg-white/[0.04] hover:-translate-y-0.5 active:scale-[0.97]"
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

        {/* ── RIGHT BALANCING SPACER (Counterbalances sidebar so hero stays dead-center) ── */}
        <div 
          className="hidden md:block w-[240px] shrink-0 pointer-events-none" 
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
    </div>
  );
}