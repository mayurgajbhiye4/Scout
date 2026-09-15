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
  const { isAuthenticated } = useAuth();

  const [prompt, setPrompt] = useState<string>('');
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(true);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
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
    navigate(isAuthenticated ? '/dashboard' : '/register', { state: { draft } });
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
    <div className="flex flex-col min-h-screen bg-[#09090B] text-[#F4F4F5] selection:bg-indigo-500/20">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── TOP NAV — centered floating pill ─────────────────────────── */}
      <header className="sticky top-0 z-40 flex justify-center pt-4 px-4 pointer-events-none">
        <nav
          className={cn(
            'pointer-events-auto flex items-center justify-between gap-6 px-4 py-2 rounded-full',
            'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
            'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
            'shadow-[var(--pill-shadow)]',
            'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            'hover:bg-[var(--pill-hover-bg)] hover:border-[var(--pill-hover-border)]',
            'hover:shadow-[var(--pill-hover-shadow)]',
            'w-full max-w-[680px]'
          )}
        >
          <Link
            to="/"
            className="text-[#F4F4F5] no-underline hover:opacity-80 transition-opacity select-none shrink-0"
          >
            <span className="font-semibold text-[22px] tracking-tight leading-none">Scout</span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-1.5 text-[13px] font-medium text-[#F4F4F5] bg-white/10 border border-white/[0.12] rounded-full hover:bg-white/[0.17] hover:border-white/[0.22] active:scale-[0.97] transition-all duration-200"
              >
                Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-1.5 text-[13px] font-medium text-[#A1A1AA] rounded-full hover:text-[#F4F4F5] hover:bg-white/[0.06] active:scale-[0.97] transition-all duration-200"
                >
                  Log In
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="px-4 py-1.5 text-[13px] font-semibold text-black bg-white rounded-full shadow-[0_2px_10px_rgba(255,255,255,0.15)] hover:bg-[#F4F4F5] hover:shadow-[0_4px_18px_rgba(255,255,255,0.25)] hover:-translate-y-[1px] active:scale-[0.97] transition-all duration-200"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* ── HERO + PROMPT ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 animate-fade-in-up">
        <div className="w-full max-w-[760px] flex flex-col items-center gap-8">

          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-[#111114] border border-[#27272A] rounded-full text-[11px] font-medium text-[#A1A1AA] tracking-wide uppercase shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Autonomous Deep Research
          </span>

          {/* Headline */}
          <div className="text-center space-y-3">
            <h1 className="text-[2rem] sm:text-[2.75rem] md:text-[3.25rem] font-bold text-[#F4F4F5] tracking-[-0.02em] leading-[1.12]">
              Research anything,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#A1A1AA] via-[#D4D4D8] to-[#FFFFFF]">
                deeply.
              </span>
            </h1>
            <p className="text-[#A1A1AA] text-base sm:text-lg max-w-[520px] mx-auto leading-relaxed">
              Drop a link, file, or question. Scout's agent reasons, retrieves, and synthesizes evidence-backed reports.
            </p>
          </div>

          {/* ── PROMPT CARD — Matte Obsidian Elevated Surface ──────────────────────── */}
          <div className="w-full rounded-2xl border border-[#27272A] bg-[#111114] shadow-[0_12px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)] transition-all duration-200 hover:border-[#3F3F46] hover:shadow-[0_16px_48px_rgba(0,0,0,0.75)] focus-within:border-[#52525B] focus-within:shadow-[0_0_0_2px_rgba(255,255,255,0.06),0_20px_56px_-8px_rgba(0,0,0,0.85)]">

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
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Drop a link, upload a file, or ask a research question…"
              className="w-full border-none outline-none resize-none font-[inherit] text-[15px] sm:text-base leading-relaxed text-[#F4F4F5] bg-transparent placeholder:text-[#71717A] px-5 pt-4 pb-3"
            />

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-4 pb-3.5 pt-1 border-t border-white/[0.04] flex-wrap gap-3">
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
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#111114] text-[#A1A1AA] border border-[#27272A] rounded-full text-[12px] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-[#3F3F46] hover:text-[#F4F4F5] hover:bg-white/[0.04] hover:-translate-y-0.5 active:scale-[0.97]"
              >
                {item.isNew && (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#10B981]/15 text-[#10B981] rounded-full leading-none tracking-wide">
                    NEW
                  </span>
                )}
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="flex items-center justify-center gap-5 pb-8 pt-4">
        <span className="text-[#3F3F46] text-xs">© 2026 Scout</span>
        <span className="text-[#27272A] text-xs">·</span>
        <span className="text-[#3F3F46] text-xs">Agentic deep research</span>
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
    </div>
  );
}