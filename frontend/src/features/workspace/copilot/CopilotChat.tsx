import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Copy,
  CornerDownRight,
  ExternalLink,
  Globe,
  Loader2,
  Minus,
  Network,
  RotateCw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { Source } from '@/api/sources';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { useTheme } from '@/features/theme';
import { resolveReferencedSources, splitReferences, type ReferencedSourceItem } from '@/lib/citations';
import { formatSessionTitle } from '@/lib/formatters';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ADD_SOURCE_OPTIONS, KIND_ICON, runAddSourceOption, type AddSourceApi } from '../canvas/addSourceOptions';
import type { EntityFocus } from '../canvas/SourcesDock';
import { getSourceKind, getSourceTitle, kindColor, type SourceKind } from '../sourceMeta';
import type { useResearchChat } from './useResearchChat';
import { ResearchActivityList, ResearchPath } from './ResearchActivity';
import { useStarterQuestions } from './useStarterQuestions';
import IngestStatus from './IngestStatus';
import type { PendingSource } from '../useWorkspaceData';
import type { RawCitation } from '@/lib/citations';
import type { ResearchTrace } from '@/api/chat';

type Chat = ReturnType<typeof useResearchChat>;

// Each add-source button in the prompt box also drafts a matching question, unless one is already written
const STARTER_PROMPTS: Record<(typeof ADD_SOURCE_OPTIONS)[number]['action'], string> = {
  youtube: 'Extract key insights, chapters, and fact-check arguments from this lecture video: ',
  github: 'Analyze repository architecture and summarize technical design tradeoffs: ',
  web: 'Synthesize the methodology and conclusions of this page or paper: ',
  file: 'Summarize the key points of the file I just added.',
};

interface CopilotChatProps {
  chat: Chat;
  sessionId: string | null;
  /**
   * A new conversation with nothing sent yet: just the prompt box, with add-source buttons and suggested questions
   * under it. The thread appears with the first message.
   */
  promptBox: boolean;
  addSource: AddSourceApi;
  /** Sources being added (dropped on the globe or added elsewhere), shown above the composer as they're indexed. */
  ingest: { items: PendingSource[]; onRetry: (tempId: string) => void; onDismiss: (tempId: string) => void };
  /** Folds the floating copilot window back into its launcher. Without it (the chat column of the flow) there's no minimize button. */
  onMinimize?: () => void;
  draft: { text: string; nonce: number } | null;
  entityFocus: EntityFocus | null;
  onClearEntity: () => void;
  selectedSource: Source | null;
  onClearSource: () => void;
  sourcesById: Map<string, Source>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}

export default function CopilotChat({
  chat,
  sessionId,
  promptBox,
  addSource,
  ingest,
  onMinimize,
  draft,
  entityFocus,
  onClearEntity,
  selectedSource,
  onClearSource,
  sourcesById,
  onHoverSource,
  onSelectSource,
}: CopilotChatProps) {
  const { session, messages, status, step, activity, isLoadingHistory, send, stop, webSearch, setWebSearch, isRateLimited, cooldownSec } = chat;
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const starters = useStarterQuestions(promptBox);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const busy = status !== 'idle';

  // "Ask Copilot" from the canvas or dock drops a prompt into the composer for the user to send.
  const [appliedDraft, setAppliedDraft] = useState<typeof draft>(null);
  if (draft && draft !== appliedDraft) {
    setAppliedDraft(draft);
    setInput(draft.text);
  }
  useEffect(() => {
    if (!draft) return;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [draft]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const submit = async () => {
    if (!input.trim() || busy) return;
    const text = input;
    setInput('');
    pinnedRef.current = true;
    const ok = await send(text);
    if (!ok) setInput(text);
  };

  const askFollowUp = (question: string) => {
    if (busy || isRateLimited) return;
    pinnedRef.current = true;
    void send(question);
  };

  const suggestions = useMemo(() => {
    const list: string[] = [];
    if (entityFocus) list.push(`Explain "${entityFocus.name}" using my sources`);
    if (selectedSource) list.push(`Summarize "${getSourceTitle(selectedSource)}"`);
    list.push('Where do my sources agree, and where do they disagree?');
    list.push('Which concepts connect the most sources?');
    if (list.length < 4) list.push('Suggest a reading order for these sources');
    return list.slice(0, 4);
  }, [entityFocus, selectedSource]);

  // Prompt box: questions about what's selected on the map first, then ones the knowledge map suggests
  const starterQuestions = useMemo(() => {
    const list: string[] = [];
    if (entityFocus) list.push(`Explain "${entityFocus.name}" using my sources`);
    if (selectedSource) list.push(`Summarize "${getSourceTitle(selectedSource)}"`);
    return [...list, ...starters.questions].slice(0, 5);
  }, [entityFocus, selectedSource, starters.questions]);

  const pickQuestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  const title = sessionId ? formatSessionTitle(session?.title) || 'Research session' : 'New research';

  return (
    <div className="font-ui flex h-full min-h-0 flex-col text-[var(--ws-ink)]">
      {/* Header: which session this is. New research lives in the top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--ws-line)] pl-4 pr-3">
        <h2 className="min-w-0 truncate text-[13.5px] font-semibold" title={title}>
          {title}
        </h2>
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize Research Copilot"
            title="Minimize (Ctrl/⌘ J)"
            className="ui-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
          >
            <Minus size={16} />
          </button>
        )}
      </header>

      {/* Thread: from the first message on, so the prompt box stays the same element as it grows into the chat */}
      {!promptBox && (
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="ui-in-fade min-h-0 flex-1 overflow-y-auto px-4 py-5 sidebar-scroll"
          aria-live="polite"
        >
          {isLoadingHistory ? (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--ws-ink-soft)]">
              <Loader2 size={15} className="animate-spin text-[var(--ws-accent)]" /> Loading conversation
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col justify-end pb-2">
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setInput(s);
                      inputRef.current?.focus();
                    }}
                    className="rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-card)] px-3 py-2 text-left text-[13px] text-[var(--ws-ink)] hover:border-[var(--ws-accent)]/60 cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id || i} className="flex justify-end">
                      <div className="max-w-[88%] whitespace-pre-wrap rounded-4xl bg-[var(--ws-accent-wash)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--ws-ink)] ring-1 ring-[var(--ws-accent)]/25">
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <AssistantMessage
                    key={msg.id || i}
                    content={msg.content}
                    citations={msg.citations}
                    researchTrace={msg.research_trace}
                    isError={msg.status === 'error'}
                    isStreaming={isLast && status === 'streaming'}
                    followUps={isLast && !busy ? msg.suggested_questions ?? [] : []}
                    onFollowUp={askFollowUp}
                    sourcesById={sourcesById}
                    onHoverSource={onHoverSource}
                    onSelectSource={onSelectSource}
                  />
                );
              })}
              {status === 'thinking' && (
                <div className="flex gap-3">
                  <AgentAvatar />
                  <div className="min-w-0 flex-1 pt-1">
                    <ResearchActivityList items={activity} fallback={step || 'Retrieving context'} />
                    <div className="mt-2.5 h-1 w-40 overflow-hidden rounded-full bg-[var(--ws-line)]">
                      <div className="ws-ingest-bar h-full w-2/5 rounded-full bg-[var(--ws-accent)]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* In a column taller than the prompt box (the session flow), the questions and composer sit at the bottom */}
      {promptBox && <div className="min-h-0 flex-1" aria-hidden />}

      {/* Suggested questions, branching like edges on the knowledge map, above the prompt box */}
      {promptBox && (
        <section
          aria-labelledby="copilot-ideas"
          className={cn('ui-in-up home-branch relative ml-[22px] min-h-0 shrink overflow-y-auto pb-2 pr-3 pt-3 sidebar-scroll', starters.isLoading && 'is-loading')}
          style={introDelay(60)}
        >
          <span className="home-branch-spine" aria-hidden />
          <div className="relative flex min-h-9 items-center gap-2 pl-5">
            <span className="home-branch-node is-root" aria-hidden />
            <h3 id="copilot-ideas" className="text-[13px] font-semibold">
              {starters.fromMap ? 'Questions from your knowledge map' : 'Questions to start with'}
            </h3>
            <button
              type="button"
              onClick={starters.refresh}
              disabled={starters.isLoading}
              aria-label="Suggest new questions from your knowledge map"
              title="Suggest new questions from your knowledge map"
              className="ui-press grid h-7 w-7 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-wait cursor-pointer"
            >
              <RotateCw size={13} className={cn(starters.isLoading && 'animate-spin text-[var(--ws-accent-ink)]')} />
            </button>
          </div>
          <ol className={cn('flex flex-col transition-opacity duration-300', starters.isLoading && 'opacity-50')}>
            {starterQuestions.map((question) => (
              <li key={question} className="relative">
                <span className="home-branch-node" aria-hidden />
                <button
                  type="button"
                  onClick={() => pickQuestion(question)}
                  disabled={starters.isLoading}
                  className="home-branch-leaf w-full rounded-full py-2 pl-5 pr-3 text-left text-[13.5px] leading-snug text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-wait cursor-pointer"
                >
                  {question}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Composer */}
      <div className={cn('shrink-0 space-y-2 px-3 pb-3', promptBox && 'pt-1')}>
        {ingest.items.length > 0 && <IngestStatus items={ingest.items} onRetry={ingest.onRetry} onDismiss={ingest.onDismiss} />}

        {(entityFocus || selectedSource) && (
          <div className="flex flex-wrap gap-1.5">
            {entityFocus && (
              <ContextChip
                label="Concept"
                value={entityFocus.name}
                onAsk={() => setInput(`Explain "${entityFocus.name}" and how it connects to the other concepts in my sources.`)}
                onClear={onClearEntity}
              />
            )}
            {selectedSource && (
              <ContextChip
                label="Source"
                value={getSourceTitle(selectedSource)}
                onAsk={() => setInput(`Summarize the key findings in "${getSourceTitle(selectedSource)}".`)}
                onClear={onClearSource}
              />
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-card)] p-2 transition-colors focus-within:border-[var(--ws-accent)] focus-within:ring-2 focus-within:ring-[var(--ws-accent-wash)]"
        >
          <label htmlFor="copilot-input" className="sr-only">
            Message the research agent
          </label>
          <textarea
            id="copilot-input"
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={isRateLimited ? `Ready again in ${cooldownSec}s` : 'Ask a question'}
            className="block max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-base sm:text-[14px] leading-relaxed text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] outline-none [caret-shape:auto]"
          />
          <div className="mt-1 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-0.5">
              {/* The same add-source buttons in every state; each source joins the open session */}
              {ADD_SOURCE_OPTIONS.map((opt) => {
                const Icon = KIND_ICON[opt.kind];
                return (
                  <button
                    key={opt.action}
                    type="button"
                    disabled={addSource.disabled}
                    onClick={() => {
                      runAddSourceOption(addSource, opt.action);
                      if (promptBox) setInput((prev) => (prev.trim() ? prev : STARTER_PROMPTS[opt.action]));
                    }}
                    aria-label={`Add ${opt.label}`}
                    title={addSource.disabled ? `Paused for ${addSource.cooldownSec}s` : `Add ${opt.label}`}
                    className="ui-press grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--ws-card-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    <Icon size={15} style={{ color: kindColor(opt.kind, isLight) }} />
                  </button>
                );
              })}
              <span className="mx-1 h-4 w-px bg-[var(--ws-line)]" aria-hidden />
              {/* Off: the web is searched only when your library falls short */}
              <button
                type="button"
                onClick={() => setWebSearch(!webSearch)}
                aria-pressed={webSearch}
                title="Always search the web"
                className={cn(
                  'ui-press flex h-8 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-medium cursor-pointer',
                  webSearch
                    ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)]'
                    : 'text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]'
                )}
              >
                <Globe size={16} />
                Web
              </button>
            </div>
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating (Esc)"
                className="ui-press flex h-9 items-center gap-1.5 rounded-full bg-[var(--ws-ink)] px-3 text-[12.5px] font-semibold text-[var(--ws-drawer)] cursor-pointer"
              >
                <Square size={11} className="fill-current" /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || isRateLimited}
                aria-label="Send"
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full transition-colors',
                  input.trim() && !isRateLimited
                    ? 'glass-accent bg-[var(--ws-accent)] text-[var(--ws-on-accent)] hover:brightness-110 cursor-pointer'
                    : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-faint)] cursor-not-allowed'
                )}
              >
                {isRateLimited ? <span className="text-[11px] font-semibold tabular-nums">{cooldownSec}s</span> : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
            )}
          </div>
        </form>
      </div>

    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30">
      <Sparkles size={14} />
    </div>
  );
}

function ContextChip({ label, value, onAsk, onClear }: { label: string; value: string; onAsk: () => void; onClear: () => void }) {
  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-full border border-[var(--ws-accent)]/35 bg-[var(--ws-accent-wash)] py-1 pl-2.5 pr-1 text-[12px]">
      <span className="max-w-[180px] truncate font-semibold text-[var(--ws-ink)]" title={`${label}: ${value}`}>{value}</span>
      <button type="button" onClick={onAsk} className="rounded-full px-1 font-medium text-[var(--ws-accent-ink)] hover:underline cursor-pointer">
        Ask
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label.toLowerCase()} context`}
        className="grid h-5 w-5 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:text-[var(--ws-ink)] cursor-pointer"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function citationKind(item: ReferencedSourceItem, sourcesById: Map<string, Source>): SourceKind {
  const s = item.sourceId ? sourcesById.get(item.sourceId) : undefined;
  if (s) return getSourceKind(s);
  if (item.sourceType === 'youtube') return 'youtube';
  if (item.sourceType === 'document') return 'pdf';
  return 'web';
}

function hostname(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Where a citation came from, when its title doesn't say: the site for web results. Library sources need none. */
function originLabel(item: ReferencedSourceItem): string | null {
  if (item.origin === 'graph') return 'Knowledge graph';
  if (item.origin === 'web') return hostname(item.url) || 'Web';
  return null;
}

function AssistantMessage({
  content,
  citations,
  researchTrace,
  isError,
  isStreaming,
  followUps,
  onFollowUp,
  sourcesById,
  onHoverSource,
  onSelectSource,
}: {
  content: string;
  citations?: RawCitation[];
  researchTrace?: ResearchTrace | null;
  isError: boolean;
  isStreaming: boolean;
  followUps: string[];
  onFollowUp: (question: string) => void;
  sourcesById: Map<string, Source>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  // The appended reference list is shown as the interactive Sources panel instead of raw markdown
  const { body } = useMemo(() => splitReferences(content), [content]);
  const refs = useMemo(() => resolveReferencedSources(citations, body), [citations, body]);
  // Nothing in the library matched: the heading says the answer rests on the web
  const webOnly = refs.length > 0 && refs.every((r) => r.origin === 'web');
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div
        className={cn(
          'ws-prose min-w-0 flex-1 rounded-4xl border bg-[var(--ws-card)] px-4 py-3',
          isError ? 'border-red-500/40' : 'border-[var(--ws-line)]'
        )}
      >
        {body ? <MarkdownRenderer content={body} /> : <p className="text-[13px] text-[var(--ws-ink-faint)]">No answer was returned.</p>}
        {isStreaming && <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-[var(--ws-accent)]" aria-hidden />}

        {!isStreaming && !isError && <ResearchPath trace={researchTrace} />}

        {refs.length > 0 && !isStreaming && (
          <div className="mt-3 border-t border-[var(--ws-line)] pt-3">
            <p className="text-[12px] font-semibold text-[var(--ws-ink)]">{webOnly ? 'Web sources' : 'Sources'}</p>
            <ol className="mt-2 flex flex-col gap-1.5" aria-label="Sources">
              {refs.map((r) => (
                <SourceRow
                  key={r.key}
                  item={r}
                  kind={citationKind(r, sourcesById)}
                  isLight={isLight}
                  linked={Boolean(r.sourceId && sourcesById.has(r.sourceId))}
                  onHoverSource={onHoverSource}
                  onSelectSource={onSelectSource}
                />
              ))}
            </ol>
          </div>
        )}

        {followUps.length > 0 && (
          <div className="mt-3 border-t border-[var(--ws-line)] pt-3">
            <div className="flex flex-col gap-1.5" role="list" aria-label="Suggested follow-up questions">
              {followUps.map((question) => (
                <button
                  key={question}
                  type="button"
                  role="listitem"
                  onClick={() => onFollowUp(question)}
                  className="flex items-start gap-2 rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-2.5 py-2 text-left text-[13px] leading-snug text-[var(--ws-ink)] hover:border-[var(--ws-accent)]/60 hover:bg-[var(--ws-accent-wash)] cursor-pointer"
                >
                  <CornerDownRight size={13} className="mt-0.5 shrink-0 text-[var(--ws-accent)]" />
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {content && !isStreaming && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="ui-press flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
            >
              {copied ? <Check size={13} className="text-[var(--ws-accent-ink)]" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceRow({
  item,
  kind,
  isLight,
  linked,
  onHoverSource,
  onSelectSource,
}: {
  item: ReferencedSourceItem;
  kind: SourceKind;
  isLight: boolean;
  linked: boolean;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}) {
  const Icon = item.origin === 'graph' ? Network : KIND_ICON[kind];
  const color = item.origin === 'graph' ? 'var(--ws-accent)' : kindColor(kind, isLight);
  const snippet = item.snippets[0];
  const origin = originLabel(item);

  const title = linked ? (
    <button
      type="button"
      onClick={() => onSelectSource(item.sourceId!)}
      title={`Show ${item.sourceTitle} on the map`}
      className="truncate text-left font-semibold hover:underline cursor-pointer"
    >
      {item.sourceTitle}
    </button>
  ) : item.url ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold hover:underline">
      {item.sourceTitle}
    </a>
  ) : (
    <span className="truncate font-semibold">{item.sourceTitle}</span>
  );

  return (
    <li
      className="group flex gap-2.5 rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-canvas)] py-2.5 pl-3.5 pr-3"
      onMouseEnter={() => linked && onHoverSource(item.sourceId!)}
      onMouseLeave={() => linked && onHoverSource(null)}
    >
      <span className="mt-0.5 w-6 shrink-0 text-[12px] font-semibold tabular-nums text-[var(--ws-ink-faint)]">[{item.displayIndex}]</span>
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex min-w-0">{title}</div>
        {origin && <p className="truncate text-[11.5px] text-[var(--ws-ink-faint)]">{origin}</p>}
        {snippet && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--ws-ink-soft)]">{snippet}</p>}
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${item.sourceTitle}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </li>
  );
}
