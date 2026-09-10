import React, { useState, useRef } from 'react';
import {
  PanelLeftClose,
  PanelLeft,
  SquarePen,
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
  FolderKanban,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { Button } from '@/components/ui/button';
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

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
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
      case 'youtube': return <Youtube size={14} color="#EF4444" />;
      case 'pdf': return <FileText size={14} color="#F59E0B" />;
      case 'github': return <Github size={14} color="#A855F7" />;
      default: return <Globe size={14} color="#38BDF8" />;
    }
  };

  const quickStarters = [
    {
      label: 'YouTube Analysis',
      icon: <Youtube size={14} color="#EF4444" />,
      isNew: true,
      prompt: 'Extract key insights, chapters, and fact-check arguments from this lecture video: ',
      action: () => setSourceModalType('youtube'),
    },
    {
      label: 'PDF Synthesis',
      icon: <FileText size={14} color="#F59E0B" />,
      prompt: 'Synthesize methodology and empirical conclusions from the uploaded PDF paper.',
      action: () => fileInputRef.current?.click(),
    },
    {
      label: 'GitHub Codebase',
      icon: <Github size={14} color="#A855F7" />,
      prompt: 'Analyze repository architecture and summarize technical design tradeoffs: ',
      action: () => setSourceModalType('github'),
    },
    {
      label: 'Doc & Web Crawler',
      icon: <Globe size={14} color="#38BDF8" />,
      prompt: 'Index this documentation site and explain core API patterns: ',
      action: () => setSourceModalType('docs'),
    },
    {
      label: 'Tech Trends',
      icon: <Sparkles size={14} color="#F59E0B" />,
      prompt: 'Identify emerging breakthroughs and paradigm shifts in AI agent architectures.',
    },
    {
      label: 'Multi-Paper Review',
      icon: <Layers size={14} color="#10B981" />,
      prompt: 'Synthesize consensus and conflicting findings across recent benchmark publications.',
    },
  ];

  const modalTitles: Record<string, { icon: React.ReactNode; title: string; desc: string; placeholder: string }> = {
    youtube: {
      icon: <Youtube size={20} color="#EF4444" />,
      title: 'Add YouTube Video Link',
      desc: 'Paste a YouTube video or playlist URL. The agent will fetch transcripts, chapters, and extract key insights.',
      placeholder: 'https://www.youtube.com/watch?v=...',
    },
    github: {
      icon: <Github size={20} color="#A855F7" />,
      title: 'Add GitHub Repository',
      desc: 'Paste a public GitHub repo URL (e.g. https://github.com/facebook/react) to index the codebase.',
      placeholder: 'https://github.com/owner/repository',
    },
    docs: {
      icon: <Globe size={20} color="#38BDF8" />,
      title: 'Add Documentation / Web Link',
      desc: 'Paste any web page or documentation link to extract and ground answers against it.',
      placeholder: 'https://docs.example.com',
    },
  };

  return (
    <div className="flex min-h-screen bg-[#09090B] text-[#F4F4F5] overflow-hidden">
      {/* Hidden file upload */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── 1. COLLAPSIBLE LEFT SIDEBAR ─────────────────────────────────────── */}
      <aside
        className={cn(
          'flex flex-col justify-between py-4 border-r border-[#27272A] bg-[#0B0B0E] shrink-0 z-20 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
          sidebarOpen ? 'w-[260px] px-3' : 'w-14 px-2'
        )}
      >
        <div>
          {/* Toggle + label */}
          <div className={cn('flex items-center mb-5', sidebarOpen ? 'justify-between' : 'justify-center')}>
            <button
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F4F4F5] transition-colors"
            >
              {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeft size={19} />}
            </button>
            {sidebarOpen && (
              <span className="text-[10px] uppercase tracking-[0.05em] font-semibold text-[#71717A]">
                WORKSPACE
              </span>
            )}
          </div>

          {/* Nav buttons */}
          <div className="flex flex-col gap-1">
            <button
              title="New Research"
              onClick={() => { setPrompt(''); setAttachedSources([]); }}
              className={cn(
                'flex items-center gap-3 px-2.5 py-2 rounded-lg bg-[#141418] border border-[#27272A] text-[#F4F4F5] text-sm font-medium transition-colors hover:bg-[#1E1E24] hover:border-[#3F3F46]',
                sidebarOpen ? 'justify-start' : 'justify-center'
              )}
            >
              <SquarePen size={17} color="#10B981" className="shrink-0" />
              {sidebarOpen && <span>New Research</span>}
            </button>
            <button
              title="Workspaces & History"
              onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
              className={cn(
                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-[#A1A1AA] text-sm transition-colors hover:bg-[#141418] hover:text-[#F4F4F5]',
                sidebarOpen ? 'justify-start' : 'justify-center'
              )}
            >
              <FolderKanban size={17} color="#818CF8" className="shrink-0" />
              {sidebarOpen && <span>Recent Workspaces</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ── 2. MAIN VIEW AREA ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* TOP HEADER */}
        <header className="sticky top-0 z-10 flex items-center justify-between h-16 px-4 sm:px-8 border-b border-white/[0.06] bg-[rgba(9,9,11,0.82)] backdrop-blur-[16px]">
          <Link to="/" className="text-white font-semibold text-lg tracking-tight no-underline hover:opacity-90 transition-opacity">
            Scout
          </Link>
          <div className="flex items-center gap-2">
            {!isAuthenticated && (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 text-sm font-medium text-[#A1A1AA] rounded-lg hover:text-[#F4F4F5] hover:bg-white/5 transition-colors active:scale-[0.97]"
                >
                  Log In
                </button>
                <Button
                  onClick={() => navigate('/register')}
                  className="rounded-full px-5 text-sm shadow-[0_2px_10px_rgba(255,255,255,0.12)] hover:shadow-[0_4px_18px_rgba(255,255,255,0.22)] hover:-translate-y-0.5 transition-all"
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </header>

        {/* ── 3. HERO & PROMPT CENTER ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-[880px] mx-auto w-full animate-fade-in-up">
          {/* Headline */}
          <h1 className="text-[1.75rem] sm:text-[2.25rem] md:text-[2.5rem] font-semibold text-[#F4F4F5] text-center tracking-tight mb-8 leading-tight">
            Dump your future knowledge
          </h1>

          {/* MAIN PROMPT CARD */}
          <div className="w-full rounded-2xl border border-[#27272A] bg-[#111114] p-5 mb-5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] transition-all duration-200 hover:border-[#3F3F46] hover:shadow-[0_12px_40px_rgba(0,0,0,0.8)] focus-within:border-[#E4E4E7] focus-within:shadow-[0_0_0_2px_rgba(228,228,231,0.25),0_20px_48px_-12px_rgba(0,0,0,0.85)]">
            {/* Attached source chips */}
            {attachedSources.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachedSources.map((source) => (
                  <span
                    key={source.id}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-[#18181B] border border-[#27272A] rounded-full text-xs text-[#F4F4F5] font-medium"
                  >
                    {getSourceIcon(source.type)}
                    {source.type.toUpperCase()}: {source.title}
                    <button
                      onClick={() => handleRemoveSource(source.id)}
                      className="ml-0.5 text-[#A1A1AA] hover:text-[#EF4444] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Textarea */}
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Drop a link or a PDF/Doc to learn"
              className="w-full border-none outline-none resize-none font-[inherit] text-base leading-relaxed text-[#F4F4F5] bg-transparent placeholder:text-[#71717A]"
            />

            {/* Bottom actions bar */}
            <div className="flex items-center justify-between pt-3 border-t border-[#1C1C22] flex-wrap gap-3 mt-1">
              {/* Left: Add Source + Reasoning + quick icons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Add Source dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1.5 rounded-lg bg-[#18181B] border border-[#27272A] text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F4F4F5] transition-colors" title="Attach Source">
                      <Plus size={15} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="min-w-[200px]">
                    <DropdownMenuItem onClick={() => setSourceModalType('youtube')}>
                      <Youtube size={16} color="#EF4444" />
                      Add YouTube Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <FileText size={16} color="#F59E0B" />
                      Upload PDF / Document
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSourceModalType('github')}>
                      <Github size={16} color="#F4F4F5" />
                      Add GitHub Repository
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSourceModalType('docs')}>
                      <Globe size={16} color="#E4E4E7" />
                      Add Docs / Website URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Reasoning toggle */}
                <button
                  onClick={() => setReasoningEnabled(!reasoningEnabled)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.8125rem] font-medium border transition-all duration-200',
                    reasoningEnabled
                      ? 'bg-purple-900/25 border-purple-600/40 text-[#F4F4F5] hover:bg-purple-900/40'
                      : 'bg-transparent border-[#27272A] text-[#A1A1AA] hover:bg-[#18181B]'
                  )}
                >
                  <Brain size={14} color={reasoningEnabled ? '#A855F7' : '#71717A'} />
                  Reasoning
                </button>

                {/* Quick source icons */}
                {[
                  { icon: <Youtube size={15} color="#EF4444" />, label: 'Paste YouTube Video', action: () => setSourceModalType('youtube') },
                  { icon: <FileText size={15} color="#F59E0B" />, label: 'Upload PDF', action: () => fileInputRef.current?.click() },
                  { icon: <Github size={15} color="#A855F7" />, label: 'GitHub Repository', action: () => setSourceModalType('github') },
                  { icon: <Globe size={15} color="#38BDF8" />, label: 'Documentation / Web URL', action: () => setSourceModalType('docs') },
                ].map(({ icon, label, action }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={action}
                    className="p-1.5 rounded-lg text-[#71717A] hover:bg-[#18181B] hover:scale-105 active:scale-90 transition-all duration-150"
                  >
                    {icon}
                  </button>
                ))}
              </div>

              {/* Send button */}
              <button
                onClick={() => handleSubmit()}
                disabled={!canSubmit}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                  canSubmit
                    ? 'bg-white text-[#09090B] shadow-[0_2px_10px_rgba(255,255,255,0.2)] hover:bg-[#E4E4E7] hover:scale-105 hover:shadow-[0_4px_18px_rgba(255,255,255,0.3)] active:scale-95'
                    : 'bg-[#18181B] text-[#52525B] cursor-not-allowed'
                )}
              >
                <ArrowUp size={17} />
              </button>
            </div>
          </div>

          {/* ── 4. QUICK SUGGESTION PILLS ─────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
            {quickStarters.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (item.action) item.action();
                  setPrompt((prev) => (prev ? `${prev} ${item.prompt}` : item.prompt));
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#111114] text-[#D4D4D8] border border-[#27272A] rounded-full text-[0.8125rem] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-[#3F3F46] hover:text-white hover:bg-white/5 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.6)] active:scale-[0.97]"
              >
                {item.isNew && (
                  <span className="px-1 py-0.5 text-[0.625rem] font-bold bg-white/10 text-[#F4F4F5] rounded-full leading-none">
                    NEW
                  </span>
                )}
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. MODAL DIALOGS FOR ADDING SOURCES ──────────────────────────────── */}
      {sourceModalType && modalTitles[sourceModalType] && (
        <Dialog open={Boolean(sourceModalType)} onOpenChange={(o) => !o && setSourceModalType(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
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
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSourceModalType(null)}>Cancel</Button>
              <Button
                disabled={!sourceInputVal.trim()}
                onClick={() => {
                  if (sourceInputVal.trim()) {
                    handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
                  }
                }}
                className="rounded-full"
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