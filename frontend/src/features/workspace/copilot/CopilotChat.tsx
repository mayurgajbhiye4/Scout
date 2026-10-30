import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronsRight,
  Copy,
  CornerDownRight,
  ExternalLink,
  Globe,
  Loader2,
  Network,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { Source } from '@/api/sources';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AttachSourcePopover from '@/features/landing/AttachSourcePopover';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import { useTheme } from '@/features/theme';
import { resolveReferencedSources, splitReferences, summarizeGrounding, type ReferencedSourceItem } from '@/lib/citations';
import { formatSessionTitle } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { KIND_ICON } from '../canvas/addSourceOptions';
import type { EntityFocus } from '../canvas/SourcesDock';
import { getSourceKind, getSourceTitle, kindColor, type SourceKind } from '../sourceMeta';
import type { useResearchChat } from './useResearchChat';
import { ResearchActivityList, ResearchPath } from './ResearchActivity';
import type { RawCitation } from '@/lib/citations';
import type { ResearchTrace } from '@/api/chat';

type Chat = ReturnType<typeof useResearchChat>;

interface CopilotChatProps {
  chat: Chat;
  sessionId: string | null;
  sessions: Array<{ id: string; title: string }>;
  onSelectSession: (session: { id: string; title: string }) => void;
  onNewSession: () => void;
  onSessionDeleted: () => void;
  onCollapse: () => void;
  initialPrompt?: string | null;
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
  sessions,
  onSelectSession,
  onNewSession,
  onSessionDeleted,
  onCollapse,
  initialPrompt,
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
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const initialSentRef = useRef<string | null>(null);
  const busy = status !== 'idle';

  // A prompt handed over from Explore is sent once its session's history has loaded.
  useEffect(() => {
    if (!initialPrompt || !sessionId || isLoadingHistory) return;
    const key = `${sessionId}:${initialPrompt}`;
    if (initialSentRef.current === key) return;
    initialSentRef.current = key;
    send(initialPrompt);
  }, [initialPrompt, sessionId, isLoadingHistory, send]);

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

  const title = sessionId ? formatSessionTitle(session?.title) || 'Research session' : 'New conversation';

  return (
    <div className="font-ui flex h-full min-h-0 flex-col text-[var(--ws-ink)]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--ws-line)] px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ui-press flex h-9 min-w-0 max-w-[calc(100%-5rem)] items-center gap-1.5 rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-card)] px-3 text-[13px] hover:border-[var(--ws-line-strong)] cursor-pointer"
            >
              <span className="text-[var(--ws-ink-faint)]">Session</span>
              <span className="truncate font-semibold">{title}</span>
              <ChevronDown size={14} className="shrink-0 text-[var(--ws-ink-faint)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="font-ui max-h-80 w-72 overflow-y-auto">
            <DropdownMenuItem onSelect={onNewSession} className="gap-2 text-[13px] font-semibold text-[var(--ws-accent-ink)]">
              <Plus size={14} /> New conversation
            </DropdownMenuItem>
            {sessions.length > 0 && <DropdownMenuSeparator />}
            {sessions.slice(0, 12).map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => onSelectSession(s)} className="justify-between gap-2 text-[13px]">
                <span className="truncate">{formatSessionTitle(s.title)}</span>
                {s.id === sessionId && <Check size={14} className="shrink-0 text-[var(--ws-accent-ink)]" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 items-center gap-1">
          {sessionId && session && (
            <DeleteSessionPopover session={session} side="bottom" align="end" sideOffset={6} onSuccess={onSessionDeleted}>
              <button
                type="button"
                aria-label="Delete this session"
                title="Delete this session"
                className="ui-press grid h-9 w-9 place-items-center rounded-[12px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-red-500 cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            </DeleteSessionPopover>
          )}
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse Copilot"
            title="Collapse (Ctrl/⌘ J)"
            className="ui-press grid h-9 w-9 place-items-center rounded-[12px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
          >
            <ChevronsRight size={18} />
          </button>
        </div>
      </header>

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sidebar-scroll"
        aria-live="polite"
      >
        {isLoadingHistory ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--ws-ink-soft)]">
            <Loader2 size={15} className="animate-spin text-[var(--ws-accent)]" /> Loading conversation
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end pb-2">
            <h3 className="text-[17px] font-semibold tracking-tight">Research with your sources</h3>
            <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-[var(--ws-ink-soft)]">
              Answers draw on your library and knowledge graph, check the evidence before answering, rewrite the search or switch to the web when it falls short, and cite every source.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                  className="rounded-[12px] border border-[var(--ws-line)] bg-[var(--ws-card)] px-3 py-2 text-left text-[13px] text-[var(--ws-ink)] hover:border-[var(--ws-accent)]/60 cursor-pointer"
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
                    <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-[6px] bg-[var(--ws-accent-wash)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--ws-ink)] ring-1 ring-[var(--ws-accent)]/25">
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

      {/* Composer */}
      <div className="shrink-0 space-y-2 px-3 pb-3">
        <ArcadeRateLimitBanner scope="chat:stream" compact />

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
          className="rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-card)] p-2 transition-colors focus-within:border-[var(--ws-accent)] focus-within:ring-2 focus-within:ring-[var(--ws-accent-wash)]"
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
            placeholder={isRateLimited ? `Chat limit reached, ready again in ${cooldownSec}s` : 'Ask the research agent'}
            className="block max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-base sm:text-[14px] leading-relaxed text-[var(--ws-ink)] placeholder:text-[var(--ws-ink-faint)] outline-none [caret-shape:auto]"
          />
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {sessionId ? (
                <AttachSourcePopover sessionId={sessionId} side="top" align="start" sideOffset={8}>
                  <button
                    type="button"
                    aria-label="Attach a link to this conversation"
                    title="Attach a link to this conversation"
                    className="ui-press grid h-8 w-8 place-items-center rounded-[9px] text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                  >
                    <Paperclip size={16} />
                  </button>
                </AttachSourcePopover>
              ) : null}
              <button
                type="button"
                onClick={() => setWebSearch(!webSearch)}
                aria-pressed={webSearch}
                title={
                  webSearch
                    ? 'Always search the web alongside your library and knowledge graph'
                    : 'Search the web only when your library has nothing relevant'
                }
                className={cn(
                  'ui-press flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-[12.5px] font-medium cursor-pointer',
                  webSearch
                    ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)]'
                    : 'text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]'
                )}
              >
                <Globe size={16} />
                {webSearch ? 'Web always' : 'Web if needed'}
              </button>
            </div>
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating (Esc)"
                className="ui-press flex h-9 items-center gap-1.5 rounded-[12px] bg-[var(--ws-ink)] px-3 text-[12.5px] font-semibold text-[var(--ws-drawer)] cursor-pointer"
              >
                <Square size={11} className="fill-current" /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || isRateLimited}
                aria-label="Send"
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-[12px] transition-colors',
                  input.trim() && !isRateLimited
                    ? 'bg-[var(--ws-accent)] text-white hover:brightness-110 cursor-pointer'
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
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30">
      <Sparkles size={14} />
    </div>
  );
}

function ContextChip({ label, value, onAsk, onClear }: { label: string; value: string; onAsk: () => void; onClear: () => void }) {
  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-[9px] border border-[var(--ws-accent)]/35 bg-[var(--ws-accent-wash)] py-1 pl-2.5 pr-1 text-[12px]">
      <span className="text-[var(--ws-ink-faint)]">{label}</span>
      <span className="max-w-[150px] truncate font-semibold text-[var(--ws-ink)]">{value}</span>
      <button type="button" onClick={onAsk} className="rounded px-1 font-medium text-[var(--ws-accent-ink)] hover:underline cursor-pointer">
        Ask
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label.toLowerCase()} context`}
        className="grid h-5 w-5 place-items-center rounded text-[var(--ws-ink-faint)] hover:text-[var(--ws-ink)] cursor-pointer"
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

function originLabel(item: ReferencedSourceItem): string {
  if (item.origin === 'graph') return 'Knowledge graph of your sources';
  if (item.origin === 'web') return hostname(item.url) || 'Web';
  if (item.matchedEntities.length > 0) return `Your library · via ${item.matchedEntities.slice(0, 2).join(', ')}`;
  return 'Your library';
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
  const grounding = useMemo(() => summarizeGrounding(refs), [refs]);
  const webOnly = refs.length > 0 && refs.every((r) => r.origin === 'web');
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div
        className={cn(
          'ws-prose min-w-0 flex-1 rounded-2xl rounded-tl-[6px] border bg-[var(--ws-card)] px-4 py-3',
          isError ? 'border-red-500/40' : 'border-[var(--ws-line)]'
        )}
      >
        {body ? <MarkdownRenderer content={body} /> : <p className="text-[13px] text-[var(--ws-ink-faint)]">No answer was returned.</p>}
        {isStreaming && <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-[var(--ws-accent)]" aria-hidden />}

        {!isStreaming && !isError && <ResearchPath trace={researchTrace} />}

        {refs.length > 0 && !isStreaming && (
          <div className="mt-3 border-t border-[var(--ws-line)] pt-3">
            <p className="text-[12px] text-[var(--ws-ink-soft)]">
              <span className="font-semibold text-[var(--ws-ink)]">Sources</span>
              {grounding && <span> · grounded in {grounding}</span>}
            </p>
            {webOnly && (
              <p className="mt-0.5 text-[11.5px] text-[var(--ws-ink-faint)]">Nothing in your library matched, so this answer draws on the web.</p>
            )}
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
            <p className="text-[12px] font-semibold text-[var(--ws-ink)]">Explore next</p>
            <div className="mt-1.5 flex flex-col gap-1.5" role="list" aria-label="Suggested follow-up questions">
              {followUps.map((question) => (
                <button
                  key={question}
                  type="button"
                  role="listitem"
                  onClick={() => onFollowUp(question)}
                  className="flex items-start gap-2 rounded-[10px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] px-2.5 py-2 text-left text-[13px] leading-snug text-[var(--ws-ink)] hover:border-[var(--ws-accent)]/60 hover:bg-[var(--ws-accent-wash)] cursor-pointer"
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
              className="ui-press flex h-7 items-center gap-1 rounded-[9px] px-2 text-[12px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
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
      className="group flex gap-2.5 rounded-[10px] border border-[var(--ws-line)] bg-[var(--ws-canvas)] p-2.5"
      onMouseEnter={() => linked && onHoverSource(item.sourceId!)}
      onMouseLeave={() => linked && onHoverSource(null)}
    >
      <span className="mt-0.5 w-6 shrink-0 text-[12px] font-semibold tabular-nums text-[var(--ws-ink-faint)]">[{item.displayIndex}]</span>
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px]" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex min-w-0">{title}</div>
        <p className="truncate text-[11.5px] text-[var(--ws-ink-faint)]">{originLabel(item)}</p>
        {snippet && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--ws-ink-soft)]">{snippet}</p>}
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${item.sourceTitle}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </li>
  );
}
