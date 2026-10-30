import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, X, Loader2, Check, RotateCw } from '@/components/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { sessionsApi } from '@/api/sessions';
import { sourcesApi } from '@/api/sources';
import { knowledgeApi } from '@/api/knowledge';
import { normalizeSourceTitle, deriveInitialSessionTitle } from '@/lib/formatters';
import DropZone from '@/components/workspace/DropZone';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { introDelay } from '@/lib/motion';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { useTheme } from '@/features/theme';
import { useAuth } from '@/features/auth/useAuth';
import { KIND_ICON } from '@/features/workspace/canvas/addSourceOptions';
import { kindColor, type SourceKind } from '@/features/workspace/sourceMeta';
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

// Source chips use the workspace's per-kind icons and colors
const SOURCE_TYPE_KIND: Record<SourceType, SourceKind> = { youtube: 'youtube', pdf: 'pdf', github: 'github', docs: 'web', web: 'web' };

// "Add a source" buttons in the composer; each also drafts a matching question
const SOURCE_STARTERS: Array<{ kind: SourceKind; label: string; opens: SourceType | 'file'; prompt: string }> = [
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
const MODAL_COPY: Record<string, { kind: SourceKind; title: string; desc: string; placeholder: string; cta: string }> = {
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

const STARTER_QUESTIONS = [
  'Synthesize recent breakthroughs in Graph RAG',
  'Compare dense retrieval vs hybrid search',
  'Analyze multi-agent reasoning workflows',
];

interface HomeComposerProps {
  /** Opens the session the composer just created, handing it the question to ask first. */
  onSessionCreated: (session: { id: string; title: string }, prompt: string) => void;
}

/**
 * The signed-in home: a question box centered on the page, with sources to attach and suggested questions under it.
 * Sending creates a session and opens it in the workspace.
 */
export default function HomeComposer({ onSessionCreated }: HomeComposerProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const isIngestRateLimited = isScopeRateLimited('sources:ingest');
  const ingestCooldownSec = getScopeSecondsLeft('sources:ingest');

  const [prompt, setPrompt] = useState<string>('');
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const resizePrompt = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const handleSelectSuggestedPrompt = (suggestedText: string) => {
    setPrompt(suggestedText);
    if (promptInputRef.current) {
      promptInputRef.current.focus();
      setTimeout(() => {
        if (promptInputRef.current) resizePrompt(promptInputRef.current);
      }, 0);
    }
  };

  const {
    data: curiosityData,
    refetch: refetchCuriosity,
    isFetching: isFetchingCuriosity,
  } = useQuery({
    queryKey: ['curiosity'],
    queryFn: () => knowledgeApi.getCuriosity(),
    staleTime: 45 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [curiosityProgress, setCuriosityProgress] = useState<number>(0);

  const refreshCuriosityMutation = useMutation({
    mutationFn: () => knowledgeApi.getCuriosity(true),
    onSuccess: (freshData) => {
      queryClient.setQueryData(['curiosity'], freshData);
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

  const hasMemoryPrompts = Boolean(curiosityData?.suggested_prompts && curiosityData.suggested_prompts.length > 0);
  const promptSuggestions = hasMemoryPrompts ? curiosityData!.suggested_prompts : STARTER_QUESTIONS;

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

      if (created?.status === 'failed') {
        setAttachedSources((prev) =>
          prev.map((s) =>
            s.id === clientSourceId
              ? { ...s, status: 'failed', error: created.metadata?.error || 'Extraction or vector embedding generation failed' }
              : s
          )
        );
        return;
      }

      const count = created.chunk_count || created.metadata?.chunk_count || 1;
      setAttachedSources((prev) =>
        prev.map((s) =>
          s.id === clientSourceId
            ? { ...s, status: 'ready', backendSourceId: created.id, title: created.title || s.title, chunkCount: count }
            : s
        )
      );
      if (created?.status === 'indexed') {
        queryClient.invalidateQueries({ queryKey: ['sources'] });
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
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
        prev.map((s) => (s.id === clientSourceId ? { ...s, status: 'failed', error: errorMsg } : s))
      );
    }
  };

  const handleAddSource = (type: SourceType, title: string, urlOrName: string, content?: string) => {
    const finalType = inferSourceType(type, urlOrName);
    const displayTitle = normalizeSourceTitle(title, urlOrName);
    const clientSourceId = Math.random().toString(36).substring(2, 9);

    setAttachedSources((prev) => [
      ...prev,
      { id: clientSourceId, type: finalType, title: displayTitle, urlOrName, status: 'extracting' },
    ]);
    setSourceModalType(null);
    setSourceInputVal('');
    ingestSourceItem(clientSourceId, finalType, displayTitle, urlOrName, content);
  };

  const handleRetrySource = (id: string) => {
    if (isIngestRateLimited) {
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
      if (allSourcesReady) {
        const t = setTimeout(() => setIndexingProgress(0), 1000);
        return () => clearTimeout(t);
      }
      return;
    }

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

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError(null);
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
      onSessionCreated(
        { id: newSession.id, title: newSession.title || deriveInitialSessionTitle(prompt, attachedSources) },
        prompt
      );
    } catch (err) {
      // The draft stays in the box so it can be sent again
      console.error('Session creation failed:', err);
      if (getHttpStatus(err) === 429) rateLimitManager.notify(err);
      setSubmitError(getServerErrorMessage(err) || 'Couldn’t start the research session. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getSourceIcon = (type: SourceType) => {
    const kind = SOURCE_TYPE_KIND[type];
    const Icon = KIND_ICON[kind];
    return <Icon size={13} className="shrink-0" style={{ color: kindColor(kind, isLight) }} />;
  };

  return (
    <DropZone onDropSource={(content, type) => {
      if (type === 'file') handleAddSource('pdf', content, content);
      else handleAddSource('docs', content, content);
    }}>
      <div className="relative flex h-full w-full flex-col overflow-y-auto px-4 sidebar-scroll sm:px-6">
        <main className="mx-auto my-auto flex w-full max-w-[680px] flex-col py-10 sm:py-14">
          <h1 className="ui-in-up text-center text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
            {firstName ? `Drop or ask something today, ${firstName}` : 'Drop or ask something today'}
          </h1>
          <p className="ui-in-up mx-auto mt-2.5 max-w-[56ch] text-center text-[15px] leading-relaxed text-[var(--ws-ink-soft)]" style={introDelay(90)}>
            Ask a question or add sources. Scout searches your library, knowledge map and the web, checks the evidence, and cites every claim.
          </p>

          <ArcadeRateLimitBanner className="mt-6 w-full" />

          {/* Composer */}
          <div style={introDelay(160)} className="ui-in-card relative mt-6 overflow-hidden rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-card)] shadow-[var(--ws-shadow)] transition-colors focus-within:border-[var(--ws-accent)] focus-within:ring-2 focus-within:ring-[var(--ws-accent-wash)]">
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
                                  className="ui-press grid h-6 w-6 place-items-center rounded-[7px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
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
                              className="ui-press grid h-6 w-6 place-items-center rounded-[7px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
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
              autoFocus
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                resizePrompt(e.target);
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
                  SOURCE_STARTERS.map((item) => {
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
                        className="ui-press flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-[12.5px] font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
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
                disabled={!canSubmit}
                aria-label="Start research"
                title="Start research (Enter)"
                className={cn(
                  'ui-press grid h-9 w-9 shrink-0 place-items-center rounded-[12px]',
                  canSubmit
                    ? 'bg-[var(--ws-accent)] text-white hover:brightness-110 cursor-pointer'
                    : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-faint)] cursor-not-allowed'
                )}
              >
                {isSubmitting || isAnySourceIndexing ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.doc,.docx"
            onChange={handleFileUpload}
          />

          {submitError && (
            <p role="alert" className="mt-3 text-center text-[13px] text-[var(--ws-danger)]">{submitError}</p>
          )}

          {/* Suggested questions branch off the composer like edges on the knowledge map */}
          <section aria-labelledby="home-ideas" style={introDelay(260)} className={cn('ui-in-up home-branch relative ml-[22px]', isCuriosityLoading && 'is-loading')}>
            <span className="home-branch-spine" aria-hidden />
            <div className="relative flex min-h-9 items-center gap-2 pl-5 pt-4">
              <span className="home-branch-node is-root" aria-hidden />
              <h2 id="home-ideas" className="text-[13px] font-semibold">
                {hasMemoryPrompts ? 'Questions from your knowledge map' : 'Questions to start with'}
              </h2>
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => refreshCuriosityMutation.mutate()}
                    disabled={isCuriosityLoading}
                    aria-label="Suggest new questions from your knowledge map"
                    className="ui-press grid h-7 w-7 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-wait cursor-pointer"
                  >
                    <RotateCw size={13} className={cn(isCuriosityLoading && 'animate-spin text-[var(--ws-accent-ink)]')} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Suggest new questions from your knowledge map</TooltipContent>
              </Tooltip>
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
      </div>

      {/* ── ADD-SOURCE DIALOG (same as the workspace's) ── */}
      <Dialog open={Boolean(sourceModalType && MODAL_COPY[sourceModalType])} onOpenChange={(o) => !o && setSourceModalType(null)}>
        {sourceModalType && MODAL_COPY[sourceModalType] && (() => {
          const copy = MODAL_COPY[sourceModalType];
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
                    className="ui-press h-9 rounded-[12px] px-4 text-[13px] font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!sourceInputVal.trim()}
                    className={cn(
                      'ui-press h-9 rounded-[12px] px-4 text-[13px] font-semibold',
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
    </DropZone>
  );
}
