import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUp,
  Check,
  Copy,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  RotateCw,
  Square,
  X,
} from 'lucide-react';
import type { AnswerExtras, ChatMessage, ResearchThread } from '@/api/chat';
import type { Source } from '@/api/sources';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { useTheme } from '@/features/theme';
import { resolveReferencedSources, splitReferences, type RawCitation, type ReferencedSourceItem } from '@/lib/citations';
import { formatSessionTitle } from '@/lib/formatters';
import { introDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ANSWER_STAGES } from '@/features/marketing/pipelineStages';
import PipelineStrip from '../PipelineStrip';
import { ADD_SOURCE_OPTIONS, KIND_ICON, runAddSourceOption, type AddSourceApi } from '../canvas/addSourceOptions';
import type { EntityFocus } from '../canvas/SourcesDock';
import { getSourceTitle, kindColor } from '../sourceMeta';
import type { useResearchChat } from './useResearchChat';
import { attachConcept, splitConcept } from './conceptContext';
import { ResearchSteps } from './ResearchActivity';
import { CitationCard } from './answer/CitationCard';
import { RelationMap } from './answer/RelationMap';
import { ResearchThreads } from './answer/ResearchThreads';
import { answerStage, traceSummary, traceToActivity, type ResearchActivityItem } from './researchProgress';
import { useStarterQuestions } from './useStarterQuestions';
import IngestStatus from './IngestStatus';
import type { PendingSource } from '../useWorkspaceData';

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
  /** Folds the copilot window into its pill in the corner. Each window control shows only when its handler is given. */
  onMinimize?: () => void;
  /** Widens the window to full height, or brings it back to its usual size when `expanded`. */
  onToggleExpand?: () => void;
  expanded?: boolean;
  /** Closes the window; the top bar's Ask button brings it back. */
  onClose?: () => void;
  draft: { text: string; nonce: number } | null;
  entityFocus: EntityFocus | null;
  /** Where the map puts the picked concept's card: inside the message box, attached to what's being asked. */
  conceptSlot?: (el: HTMLDivElement | null) => void;
  selectedSource: Source | null;
  onClearSource: () => void;
  sourcesById: Map<string, Source>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
  /** The knowledge-map concept with this name, if there is one, so the answer can offer to show it. */
  findConcept?: (label: string) => EntityFocus | null;
  /** Picks a concept on the knowledge map. */
  onFocusConcept?: (concept: EntityFocus) => void;
}

/** An answer's research threads; older answers only saved plain questions. */
function threadsOf(msg: ChatMessage): ResearchThread[] {
  if (msg.answer_extras?.threads?.length) return msg.answer_extras.threads;
  return (msg.suggested_questions ?? []).map((question) => ({ kind: 'deeper' as const, text: '', question }));
}

export default function CopilotChat({
  chat,
  sessionId,
  promptBox,
  addSource,
  ingest,
  onMinimize,
  onToggleExpand,
  expanded = false,
  onClose,
  draft,
  entityFocus,
  conceptSlot,
  selectedSource,
  onClearSource,
  sourcesById,
  onHoverSource,
  onSelectSource,
  findConcept,
  onFocusConcept,
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

  // The input grows with what's typed, up to 160px. A hidden window (closed or minimized) measures 0, so it's only
  // measured while it shows, and again whenever it appears or changes width (the window being resized or expanded).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const fit = () => {
      if (!el.getClientRects().length) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    };
    fit();
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
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
    const ok = await send(entityFocus ? attachConcept(text, entityFocus.name) : text);
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

  // The conversation's turns. While an answer is generated, the answer half of the pipeline sits right above its
  // steps: after the question while it's researched, then at the top of the reply as it streams. One key in one
  // list, so it carries on rather than restarting when the reply begins.
  const lastMessage = messages.at(-1);
  const replyInProgress = busy && lastMessage?.role === 'assistant' && lastMessage.status === 'streaming';
  const turns: ReactNode[] = messages.map((msg, i) => {
    const isLast = i === messages.length - 1;
    if (msg.role === 'user') return <UserBubble key={msg.id || i} content={msg.content} />;
    // The reply opens before its first words arrive; until then the research steps below stand in for it
    if (isLast && replyInProgress && status === 'thinking' && !msg.content) return null;
    const isStreaming = isLast && status === 'streaming';
    return (
      <AssistantMessage
        key={msg.id || i}
        content={msg.content}
        citations={msg.citations}
        steps={isStreaming ? activity : traceToActivity(msg.research_trace)}
        stepsSummary={msg.research_trace ? traceSummary(msg.research_trace) : undefined}
        isError={msg.status === 'error'}
        isStreaming={isStreaming}
        extras={msg.answer_extras}
        threads={isLast && !busy ? threadsOf(msg) : []}
        threadsDisabled={busy || isRateLimited}
        onAsk={askFollowUp}
        findConcept={findConcept}
        onFocusConcept={onFocusConcept}
        sourcesById={sourcesById}
        isLight={isLight}
        onHoverSource={onHoverSource}
        onSelectSource={onSelectSource}
      />
    );
  });
  if (busy) {
    turns.splice(
      replyInProgress ? turns.length - 1 : turns.length,
      0,
      <PipelineStrip
        key="answer-pipeline"
        stages={ANSWER_STAGES}
        active={answerStage(activity, status === 'streaming')}
        loop={{ from: 1, to: 0, live: activity.some((a) => a.kind === 'retry') }}
        className="-mb-3 w-[168px]"
      />
    );
  }

  return (
    <div className="font-ui flex h-full min-h-0 flex-col text-[var(--ws-ink)]">
      {/* Header: which session this is. New research lives in the top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--ws-line)] pl-4 pr-3">
        <h2 className="min-w-0 truncate text-[13.5px] font-semibold" title={title}>
          {title}
        </h2>
        {/* Window controls, in Linear's order: minimize, expand, close */}
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          {onMinimize && (
            <WindowControl label="Minimize Research Copilot" title="Minimize (Ctrl/⌘ J)" onClick={onMinimize}>
              <Minus size={16} aria-hidden />
            </WindowControl>
          )}
          {onToggleExpand && (
            <WindowControl
              label={expanded ? 'Restore Research Copilot size' : 'Expand Research Copilot'}
              title={expanded ? 'Restore size' : 'Expand'}
              onClick={onToggleExpand}
            >
              {expanded ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
            </WindowControl>
          )}
          {onClose && (
            <WindowControl label="Close Research Copilot" title="Close" onClick={onClose}>
              <X size={16} aria-hidden />
            </WindowControl>
          )}
        </div>
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
            <div className="flex flex-col gap-7">
              {turns}
              {status === 'thinking' && <ResearchSteps items={activity} live fallback={step || 'Retrieving context'} />}
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

        {selectedSource && (
          <div className="flex flex-wrap gap-1.5">
            <ContextChip
              label="Source"
              value={getSourceTitle(selectedSource)}
              onAsk={() => setInput(`Summarize the key findings in "${getSourceTitle(selectedSource)}".`)}
              onClear={onClearSource}
            />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-card)] p-2 transition-colors focus-within:border-[var(--ws-accent)] focus-within:ring-2 focus-within:ring-[var(--ws-accent-wash)]"
        >
          <div ref={conceptSlot} className="mb-1 border-b border-[var(--ws-line)] px-2 pb-2 pt-1 empty:hidden" />
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
            placeholder={isRateLimited ? `Ready again in ${cooldownSec}s` : entityFocus ? `Ask about ${entityFocus.name}` : 'Ask a question'}
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

/** Your message, with the concept it was asked about as a tag above it. */
/** One of the window's minimize, expand and close buttons in the header. */
function WindowControl({ label, title, onClick, children }: { label: string; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="ui-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
    >
      {children}
    </button>
  );
}

export function UserBubble({ content }: { content: string }) {
  const { concept, text } = splitConcept(content);
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] whitespace-pre-wrap rounded-4xl bg-[var(--ws-accent-wash)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--ws-ink)] ring-1 ring-[var(--ws-accent)]/25">
        {concept && (
          <span className="mb-1 flex w-fit max-w-full items-center gap-1 rounded-full bg-[var(--ws-card)] px-2 py-0.5 text-[11.5px] font-semibold leading-normal">
            <Network size={11} className="shrink-0 text-[var(--ws-accent-ink)]" aria-hidden />
            <span className="truncate" title={concept}>{concept}</span>
          </span>
        )}
        <span>{text}</span>
      </div>
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

export function AssistantMessage({
  content,
  citations,
  extras,
  steps,
  stepsSummary,
  isError,
  isStreaming,
  threads,
  threadsDisabled,
  onAsk,
  findConcept,
  onFocusConcept,
  sourcesById,
  isLight,
  onHoverSource,
  onSelectSource,
}: {
  content: string;
  citations?: RawCitation[];
  /** Evidence quotes, graph relations and research threads; null while streaming and on older answers. */
  extras?: AnswerExtras | null;
  /** The agent's research steps for this reply: live while it streams, the saved trace once it's done. */
  steps: ResearchActivityItem[];
  stepsSummary?: string;
  isError: boolean;
  isStreaming: boolean;
  threads: ResearchThread[];
  threadsDisabled: boolean;
  onAsk: (question: string) => void;
  findConcept?: (label: string) => EntityFocus | null;
  onFocusConcept?: (concept: EntityFocus) => void;
  sourcesById: Map<string, Source>;
  isLight: boolean;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}) {
  // The appended reference list is shown as the interactive Sources list instead of raw markdown
  const { body } = useMemo(() => splitReferences(content), [content]);
  const refs = useMemo(() => resolveReferencedSources(citations, body), [citations, body]);
  const searchCount = steps.filter((s) => s.kind === 'search').length;
  const proseRef = useRef<HTMLDivElement>(null);
  const relations = isStreaming ? [] : extras?.relations ?? [];

  return (
    <article className="flex min-w-0 flex-col gap-4">
      {steps.length > 0 && (
        <ResearchSteps
          items={steps}
          live={false}
          summary={stepsSummary ?? `Searched ${searchCount === 1 ? 'once' : `${searchCount} times`}`}
        />
      )}

      {/* The answer in its card: the paragraph and bullets, each claim closed by its citation circles. The passage
          behind a circle opens over the answer, right under that circle's line */}
      <div className={cn(!isError && 'rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-card)] px-4 py-3.5')}>
        <div ref={proseRef} className={cn('ws-prose min-w-0', isError && 'is-error')}>
          {body ? (
            <MarkdownRenderer content={body} citationMarks markClaims={!isStreaming && !isError} />
          ) : (
            <p className="text-[13.5px] text-[var(--ws-ink-faint)]">No answer was returned.</p>
          )}
          {isStreaming && <span className="ws-caret" aria-hidden />}
        </div>
        {!isStreaming && !isError && body && (
          <CitationCard
            proseRef={proseRef}
            content={body}
            extras={extras}
            refs={refs}
            sourcesById={sourcesById}
            isLight={isLight}
            onHoverSource={onHoverSource}
            onSelectSource={onSelectSource}
          />
        )}
      </div>

      {relations.length > 0 && <RelationMap relations={relations} findConcept={findConcept} onFocusConcept={onFocusConcept} />}

      {!isStreaming && content && (
        <AnswerSources
          refs={refs}
          content={content}
          sourcesById={sourcesById}
          onHoverSource={onHoverSource}
          onSelectSource={onSelectSource}
        />
      )}

      <ResearchThreads threads={threads} disabled={threadsDisabled} onAsk={onAsk} />
    </article>
  );
}

/** Sources shown before the list folds; the rest are one "more" away. */
const SOURCES_SHOWN = 3;

/** The answer's cited sources, with the copy button on the label row. */
function AnswerSources({
  refs,
  content,
  sourcesById,
  onHoverSource,
  onSelectSource,
}: {
  refs: ReferencedSourceItem[];
  content: string;
  sourcesById: Map<string, Source>;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  // Nothing in the library matched: the label says the answer rests on the web
  const label = refs.length > 0 && refs.every((r) => r.origin === 'web') ? 'Web sources' : 'Sources';
  const hidden = refs.length - SOURCES_SHOWN;
  const shown = expanded || hidden <= 1 ? refs : refs.slice(0, SOURCES_SHOWN);

  if (refs.length === 0) {
    return (
      <div className="-ml-1.5 flex">
        <CopyAnswerButton content={content} />
      </div>
    );
  }
  return (
    <section aria-label={label}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="ws-answer-label mb-0">{label}</p>
        <CopyAnswerButton content={content} />
      </div>
      <ol id={listId} className="-mx-2 flex flex-col">
        {shown.map((r) => (
          <SourceRow
            key={r.key}
            item={r}
            linked={Boolean(r.sourceId && sourcesById.has(r.sourceId))}
            onHoverSource={onHoverSource}
            onSelectSource={onSelectSource}
          />
        ))}
      </ol>
      {hidden > 1 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="ui-press -ml-2 mt-0.5 rounded-full px-2 py-0.5 text-[12px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink-soft)] cursor-pointer"
        >
          {expanded ? 'Show fewer' : `${hidden} more`}
        </button>
      )}
    </section>
  );
}

function CopyAnswerButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(content).then(() => {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        });
      }}
      aria-label={copied ? 'Copied' : 'Copy answer'}
      title={copied ? 'Copied' : 'Copy answer'}
      className="ui-press grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
    >
      {copied ? <Check size={14} className="text-[var(--ws-accent-ink)]" /> : <Copy size={14} />}
    </button>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** One cited source: its number, name and (for a page) its site. It opens the source, or shows it on the map. */
function SourceRow({
  item,
  linked,
  onHoverSource,
  onSelectSource,
}: {
  item: ReferencedSourceItem;
  linked: boolean;
  onHoverSource: (id: string | null) => void;
  onSelectSource: (id: string) => void;
}) {
  const row = 'group flex w-full min-w-0 items-baseline gap-2.5 rounded-full px-2 py-1 text-left text-[13px] leading-5';
  const interactive = 'hover:bg-[var(--ws-card-hover)] cursor-pointer';
  const host = item.url ? hostOf(item.url) : '';
  const inner = (
    <>
      <span className="w-3.5 shrink-0 text-right text-[11.5px] tabular-nums text-[var(--ws-ink-faint)]">{item.displayIndex}</span>
      <span className="min-w-0 truncate text-[var(--ws-ink-soft)] group-hover:text-[var(--ws-ink)]">{item.sourceTitle}</span>
      {host && <span className="ml-auto shrink-0 pl-2 text-[11.5px] text-[var(--ws-ink-faint)]">{host}</span>}
    </>
  );

  let content;
  if (item.url) {
    content = (
      <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.sourceTitle} className={cn(row, interactive)}>
        {inner}
      </a>
    );
  } else if (linked) {
    content = (
      <button type="button" onClick={() => onSelectSource(item.sourceId!)} title={`Show ${item.sourceTitle} on the map`} className={cn(row, interactive)}>
        {inner}
      </button>
    );
  } else {
    content = (
      <span title={item.sourceTitle} className={row}>
        {inner}
      </span>
    );
  }

  return (
    <li
      className="min-w-0"
      onMouseEnter={() => linked && onHoverSource(item.sourceId!)}
      onMouseLeave={() => linked && onHoverSource(null)}
    >
      {content}
    </li>
  );
}
