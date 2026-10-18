import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Sparkles,
  ArrowUp,
  Square,
  User,
  Trash2,
  Loader2,
  Globe,
  Copy,
  Check,
  Youtube,
  Plus,
  ChevronDown,
  BookOpen,
  FileText,
  Network,
  ExternalLink,
} from 'lucide-react';
import { sessionsApi } from '@/api/sessions';
import { chatApi, ChatMessage } from '@/api/chat';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import DeleteSessionPopover from '@/features/research/DeleteSessionPopover';
import AttachSourcePopover from '@/features/landing/AttachSourcePopover';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatSessionTitle } from '@/lib/formatters';
import { resolveReferencedSources, ReferencedSourceItem } from '@/lib/citations';
import { soundEffects } from '@/lib/soundEffects';

interface LandingChatWindowProps {
  sessionId: string;
  initialPrompt?: string | null;
  onClose: () => void;
  onSessionDeleted?: () => void;
}

export default function LandingChatWindow({
  sessionId,
  initialPrompt,
  onClose,
  onSessionDeleted,
}: LandingChatWindowProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingStep, setStreamingStep] = useState<string | null>(null);
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch session details
  const { data: session } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessionsApi.getSession(sessionId),
    enabled: Boolean(sessionId),
  });

  // Fetch session sources
  const { data: sessionSources } = useQuery({
    queryKey: ['session-sources', sessionId],
    queryFn: () => sessionsApi.getSessionSources(sessionId),
    enabled: Boolean(sessionId),
  });

  // Fetch session chat history
  const { data: initialMessages, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => chatApi.getMessages(sessionId),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Track if user manually scrolled up
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceToBottom > 80);
  };

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      if (smooth) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }
    setUserScrolledUp(false);
  }, []);

  // Smart auto-scroll during streaming
  useEffect(() => {
    if (!userScrolledUp && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming, isThinking, userScrolledUp]);

  // Abort / Stop Generation handler
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsThinking(false);
    setStreamingStep(null);
  }, []);

  // Keyboard shortcut: Esc to stop generation
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        stopGeneration();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isStreaming, stopGeneration]);

  // Execute a message send and stream response in real time
  const sendMessage = async (userText: string) => {
    if (!userText.trim() || !sessionId || isStreaming) return;

    const trimmedMsg = userText.trim();
    setInput('');

    // Optimistic UI for user message
    const tempUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: 'user',
      content: trimmedMsg,
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsStreaming(true);
    setIsThinking(true);
    setStreamingStep('Preparing research query...');
    setUserScrolledUp(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = localStorage.getItem('airw_token') || localStorage.getItem('token');
      const response = await fetch(`/api/v1/chat/sessions/${sessionId}/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: trimmedMsg, force_web_search: forceWebSearch }),
      });

      if (!response.body) throw new Error('No response body received');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let asstContent = '';
      let citationsList: any[] = [];
      const tempAsstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempAsstMsg]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            // Step update (e.g. retrieving docs, web search, synthesizing)
            if (data.status === 'step' && data.step) {
              setIsThinking(true);
              setStreamingStep(data.step);
            }

            // Real-time token streaming delta
            if (data.delta) {
              setIsThinking(false);
              setStreamingStep(null);
              asstContent += data.delta;
              setMessages((prev) => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (lastIdx >= 0) {
                  next[lastIdx] = {
                    ...tempAsstMsg,
                    content: asstContent,
                    status: 'streaming',
                  };
                }
                return next;
              });
            }

            // Citations received
            if (data.citations && Array.isArray(data.citations)) {
              citationsList = data.citations;
            }

              // Stream completed
              if (data.done) {
                soundEffects.playStreamComplete();
                setIsThinking(false);
                setStreamingStep(null);
                const finalContent = data.content || asstContent;
                setMessages((prev) => {
                  const next = [...prev];
                  const lastIdx = next.length - 1;
                  const existing = next[lastIdx];
                  if (lastIdx >= 0 && existing) {
                    next[lastIdx] = {
                      ...tempAsstMsg,
                      id: data.message_id || tempAsstMsg.id,
                      content: finalContent,
                      citations: citationsList.length > 0 ? citationsList : existing.citations,
                      status: 'completed',
                    };
                  }
                  return next;
                });

                // Immediately update session cache if backend generated a new title or summary
                if (data.session_title || data.session_summary) {
                  queryClient.setQueryData(['sessions', sessionId], (old: any) => {
                    if (!old) return old;
                    return {
                      ...old,
                      title: data.session_title || old.title,
                      session_summary: data.session_summary || old.session_summary,
                    };
                  });
                  queryClient.setQueriesData({ queryKey: ['sessions'] }, (old: any) => {
                    if (!old) return old;
                    if (Array.isArray(old)) {
                      return old.map((s: any) =>
                        s.id === sessionId
                          ? { ...s, title: data.session_title || s.title, session_summary: data.session_summary || s.session_summary }
                          : s
                      );
                    }
                    if (old.pages && Array.isArray(old.pages)) {
                      return {
                        ...old,
                        pages: old.pages.map((page: any[]) =>
                          page.map((s: any) =>
                            s.id === sessionId
                              ? { ...s, title: data.session_title || s.title, session_summary: data.session_summary || s.session_summary }
                              : s
                          )
                        ),
                      };
                    }
                    return old;
                  });
                }
              } else if (data.content && !asstContent) {
              // Backward compatibility fallback for full content
              setIsThinking(false);
              asstContent = data.content;
              setMessages((prev) => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (lastIdx >= 0) {
                  next[lastIdx] = {
                    ...tempAsstMsg,
                    content: asstContent,
                    status: 'completed',
                  };
                }
                return next;
              });
            }
          } catch (err) {
            console.error('SSE parse error:', err);
          }
        }
      }

      // Invalidate queries so session title / last activity updates in sidebar
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', sessionId] });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User aborted stream cleanly
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          const lastMsg = next[lastIdx];
          if (lastMsg && lastMsg.role === 'assistant') {
            next[lastIdx] = {
              ...lastMsg,
              status: 'completed',
            };
          }
          return next;
        });
      } else {
        console.error('Chat execution error:', err);
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          const lastMsg = next[lastIdx];
          if (lastMsg && lastMsg.role === 'assistant') {
            next[lastIdx] = {
              ...lastMsg,
              content: (lastMsg.content || '') + '\n\n*(Generation interrupted)*',
              status: 'error',
            };
          }
          return next;
        });
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setIsThinking(false);
      setStreamingStep(null);
    }
  };

  // If initialPrompt was provided from the hero search, trigger it once
  useEffect(() => {
    if (
      initialPrompt &&
      sessionId &&
      initialSentRef.current !== initialPrompt &&
      !isLoadingMessages
    ) {
      initialSentRef.current = initialPrompt;
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, sessionId, isLoadingMessages]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 w-full h-full flex flex-col',
        'bg-[#0d0d0f] rounded-none border-none overflow-hidden',
        'transition-all duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#27272a] bg-[#141416] shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore button */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium text-[#a1a1aa] hover:text-[#f4f4f5] bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-[#3f3f46] transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft size={14} className="text-[#3b82f6]" />
            <span className="hidden sm:inline">Explore</span>
          </button>

          <div className="h-4 w-px bg-[#27272a] shrink-0" />

          {/* Session Title & Metadata */}
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-semibold text-[#f4f4f5] truncate max-w-[240px] sm:max-w-[400px]" title={formatSessionTitle(session?.title)}>
              {formatSessionTitle(session?.title) || 'Research Session'}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-[#71717a]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#2563eb]" />
                {session?.mode === 'deep_research' || session?.mode === 'research' ? 'Deep Research' : 'Autonomous Agent'}
              </span>
              {session?.last_activity_at && (
                <>
                  <span>·</span>
                  <span>{formatRelativeTime(session.last_activity_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Active Session Sources Chips */}
        {sessionSources && sessionSources.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 max-w-[360px] overflow-x-auto no-scrollbar py-0.5">
            {sessionSources.map((src: any) => {
              const isYt = (src.canonical_uri || '').includes('youtube') || (src.canonical_uri || '').includes('youtu.be') || src.source_type === 'youtube';
              const chunks = src.chunk_count || src.metadata?.chunk_count;
              return (
                <span
                  key={src.id}
                  title={`${src.title} (${src.canonical_uri || ''})`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-[11px] font-medium bg-[#18181b] border border-[#27272a] text-[#f4f4f5] shrink-0"
                >
                  {isYt ? (
                    <Youtube size={11} className="text-[#ef4444]" />
                  ) : (
                    <Globe size={11} className="text-[#3b82f6]" />
                  )}
                  <span className="truncate max-w-[130px]">{src.title}</span>
                  {chunks ? (
                    <span className="text-[9px] text-[#3b82f6] font-mono bg-[#2563eb]/15 px-1.5 py-0.2 rounded-none border border-[#2563eb]/30">
                      {chunks} chunks
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 bg-[#2563eb]" />
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setForceWebSearch((prev) => !prev)}
            title={forceWebSearch ? 'Live Web Search Active' : 'Grounding with Session Sources'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-none text-xs font-medium border transition-colors cursor-pointer',
              forceWebSearch
                ? 'bg-[#2563eb] border-[#2563eb] text-white'
                : 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#202024]'
            )}
          >
            <Globe size={12} className={forceWebSearch ? 'text-white' : 'text-[#3b82f6]'} />
            <span className="hidden sm:inline">Web Search</span>
          </button>

          <DeleteSessionPopover
            session={session || null}
            side="bottom"
            align="end"
            sideOffset={6}
            onSuccess={() => {
              onSessionDeleted?.();
              onClose();
            }}
          >
            <button
              type="button"
              title="Delete session"
              className="p-1.5 rounded-none text-[#71717a] hover:text-[#ef4444] hover:bg-[#202024] border border-transparent hover:border-[#27272a] transition-colors cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          </DeleteSessionPopover>
        </div>
      </header>

      {/* ── MESSAGES SCROLL AREA ── */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6 sidebar-scroll"
      >
        <div className="max-w-3xl lg:max-w-4xl mx-auto w-full space-y-6">
          {isLoadingMessages ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-[#71717a]">
              <Loader2 size={24} className="animate-spin text-[#2563eb]" />
              <span className="text-xs">Loading research thread...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4">
              <div className="w-12 h-12 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
                <Sparkles size={22} className="text-[#3b82f6]" />
              </div>
              <h3 className="text-base font-semibold text-[#f4f4f5] mb-1">
                {session?.title || 'Start Exploring'}
              </h3>
              <p className="text-xs text-[#a1a1aa] max-w-sm mb-6 leading-relaxed">
                Ask questions to analyze indexed documents, synthesize literature, or formulate deep research hypotheses.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLatestAssistant = !isUser && idx === messages.length - 1;
              const isMsgStreaming = isLatestAssistant && isStreaming;

              return (
                <div
                  key={msg.id || idx}
                  className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start items-start')}
                >
                  {/* Assistant avatar */}
                  {!isUser && (
                    <div className="w-7 h-7 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0 mt-0.5 text-[#2563eb]">
                      <Sparkles size={14} />
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={cn(
                      'text-sm leading-relaxed transition-all select-text font-mono',
                      isUser
                        ? 'max-w-[85%] sm:max-w-[78%] px-4 py-3 bg-[#1e1e24] text-[#f4f4f5] border border-[#2f2f38] shadow-[3px_3px_0px_#000000]'
                        : 'max-w-[92%] sm:max-w-[86%] px-5 py-4 bg-[#16161a] text-[#e4e4e7] border border-[#27272a] border-l-4 border-l-[#3b82f6] shadow-[3px_3px_0px_#000000]'
                    )}
                  >
                    {isUser ? (
                      <div>
                        <div className="text-[10px] font-bold text-[#3b82f6] tracking-wider uppercase mb-1 flex items-center gap-1.5">
                          <span>[YOU]</span>
                        </div>
                        <div className="whitespace-pre-wrap font-normal">{msg.content}</div>
                      </div>
                    ) : (
                      <div>
                        {/* Assistant Header Tag */}
                        <div className="text-[10px] font-bold text-[#3b82f6] tracking-wider uppercase mb-2 flex items-center gap-1.5 select-none">
                          <span className="w-2 h-2 bg-[#3b82f6] inline-block" />
                          <span>[SCOUT AGENT]</span>
                          {isMsgStreaming && (
                            <span className="text-[#93c5fd] font-normal">[LIVE STREAM]</span>
                          )}
                        </div>

                        {/* Live Thinking / Step Progress Banner */}
                        {isMsgStreaming && isThinking && !msg.content && (
                          <div className="flex flex-col gap-2 py-1.5 text-xs font-mono text-[#a1a1aa]">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-4 bg-[#3b82f6] text-black font-mono font-black text-center inline-flex items-center justify-center animate-arcade-blink select-none shadow-[1px_1px_0px_#000]">
                                █
                              </span>
                              <span className="text-[#3b82f6] font-bold tracking-wider">[REASONING]</span>
                              <span className="text-[#f4f4f5] font-medium tracking-wide">
                                {streamingStep || 'Reasoning & retrieving context...'}
                              </span>
                            </div>
                            <div className="w-full max-w-md h-1 bg-[#18181b] border border-[#27272a] overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#06b6d4] animate-[indeterminateProgress_1.8s_ease-in-out_infinite]" />
                            </div>
                          </div>
                        )}

                        {/* Markdown rendered content with streaming bold block cursor */}
                        {msg.content ? (
                          <div>
                            <MarkdownRenderer content={msg.content} />
                            {isMsgStreaming && (
                              <span
                                className="inline-block w-2.5 h-4.5 ml-1 bg-[#3b82f6] text-black font-mono font-black align-middle animate-arcade-blink select-none shadow-[1px_1px_0px_#000]"
                                title="Generating..."
                              >
                                █
                              </span>
                            )}
                          </div>
                        ) : !isThinking ? (
                          <span className="text-xs text-[#71717a] italic">Empty response</span>
                        ) : null}

                        {/* Referenced Sources Badges (Deduplicated, Actual Referenced Sources) */}
                        {(() => {
                          const referencedSources = resolveReferencedSources(msg.citations, msg.content);
                          if (!referencedSources || referencedSources.length === 0) return null;

                          return (
                            <div className="mt-3.5 pt-2.5 border-t border-[#27272a] flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider">
                                <BookOpen size={11} className="text-[#3b82f6]" />
                                <span>Referenced Sources ({referencedSources.length})</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {referencedSources.map((source: ReferencedSourceItem) => {
                                  const isYt = source.sourceType === 'youtube';
                                  const isGraph = source.sourceType === 'graph';
                                  const isDoc = source.sourceType === 'document';
                                  const snippetText = source.snippets.join('\n\n---\n\n');

                                  const tooltipContent = [
                                    source.sourceTitle,
                                    isGraph ? '[Knowledge Graph Relationship]' : null,
                                    snippetText ? `"${snippetText.slice(0, 300)}"` : null,
                                  ].filter(Boolean).join('\n\n');

                                  const PillContent = (
                                    <>
                                      <span className="w-3.5 h-3.5 rounded-none bg-[#202024] border border-[#27272a] flex items-center justify-center text-[9px] font-mono font-medium text-[#3b82f6]">
                                        {source.displayIndex}
                                      </span>
                                      {isGraph ? (
                                        <Network size={11} className="text-[#a855f7] shrink-0" />
                                      ) : isYt ? (
                                        <Youtube size={11} className="text-[#ef4444] shrink-0" />
                                      ) : isDoc ? (
                                        <FileText size={11} className="text-[#f59e0b] shrink-0" />
                                      ) : (
                                        <Globe size={11} className="text-[#3b82f6] shrink-0" />
                                      )}
                                      <span className="truncate max-w-[170px]">{source.sourceTitle}</span>
                                      {source.url && (
                                        <ExternalLink size={9} className="text-[#71717a] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                      )}
                                    </>
                                  );

                                  if (source.url) {
                                    return (
                                      <a
                                        key={source.key}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={tooltipContent}
                                        className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-[11px] bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-[#2563eb] text-[#e4e4e7] transition-colors cursor-pointer select-none shadow-[1px_1px_0px_#000]"
                                      >
                                        {PillContent}
                                      </a>
                                    );
                                  }

                                  return (
                                    <div
                                      key={source.key}
                                      title={tooltipContent}
                                      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-[11px] bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-[#2563eb] text-[#e4e4e7] transition-colors cursor-default select-none shadow-[1px_1px_0px_#000]"
                                    >
                                      {PillContent}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Footer actions for assistant */}
                        {msg.content && (
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#27272a] text-[11px] text-[#71717a]">
                            <div>
                              {isMsgStreaming && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-[#3b82f6] font-mono">
                                  <span className="w-1.5 h-1.5 rounded-none bg-[#2563eb] animate-ping" />
                                  <span>Streaming</span>
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleCopy(msg.id || String(idx), msg.content)}
                              title="Copy response"
                              className="flex items-center gap-1 text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors p-1 rounded-none hover:bg-[#202024] cursor-pointer"
                            >
                              {copiedId === (msg.id || String(idx)) ? (
                                <>
                                  <Check size={11} className="text-[#10b981]" />
                                  <span className="text-[#10b981]">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* User avatar */}
                  {isUser && (
                    <div className="w-7 h-7 rounded-none bg-[#27272a] border border-[#3f3f46] flex items-center justify-center shrink-0 mt-0.5 text-xs font-medium text-[#f4f4f5]">
                      <User size={13} />
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        {/* Floating "Scroll to bottom" button when user scrolled up during stream */}
        {userScrolledUp && (
          <div className="sticky bottom-2 flex justify-center pointer-events-none z-20">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-[#18181b] hover:bg-[#202024] border border-[#27272a] text-xs text-[#f4f4f5] transition-colors cursor-pointer"
            >
              <ChevronDown size={13} className="text-[#3b82f6]" />
              <span>{isStreaming ? 'New response streaming...' : 'Jump to latest'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── BOTTOM INPUT STUDIO (Arcade Command Box) ── */}
      <footer className="shrink-0 p-3 sm:p-4 border-t border-[#27272a] bg-[#121215] font-mono">
        <div className="max-w-3xl lg:max-w-4xl mx-auto w-full flex flex-col gap-2">
          <form
            onSubmit={handleSubmit}
            className={cn(
              'relative flex flex-col w-full rounded-none',
              'bg-[#1e1e24] border border-[#2f2f38] border-l-4 border-l-[#3b82f6] shadow-[4px_4px_0px_#000000]',
              'focus-within:border-[#3b82f6] focus-within:border-l-[#3b82f6]',
              'transition-colors p-3'
            )}
          >
            {/* Textarea with Terminal Prompt Indicator */}
            <div className="flex items-start">
              <span className="text-[#3b82f6] font-mono text-base font-black mr-2 select-none">&gt;</span>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isStreaming
                    ? 'Generating research response (press Esc or click Stop)...'
                    : 'Ask a follow-up, request synthesis, or cross-examine sources...'
                }
                rows={2}
                className="w-full bg-transparent text-sm text-[#f4f4f5] placeholder-[#52525b] resize-none outline-none border-0 focus:ring-0 leading-relaxed font-mono sidebar-scroll max-h-[140px] caret-[#3b82f6]"
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-[#2a2a33]">
              <div className="flex items-center gap-2 text-[11px] text-[#71717a]">

                {/* Add Source button directly in chat */}
                <AttachSourcePopover
                  sessionId={sessionId}
                  side="top"
                  align="start"
                  sideOffset={8}
                >
                  <button
                    type="button"
                    title="Attach YouTube video, article or link to this chat"
                    className="arcade-btn flex items-center gap-1.5 px-2.5 py-0.5 bg-[#141418] hover:bg-[#202028] border border-[#27272a] hover:border-[#3b82f6] text-[#a1a1aa] hover:text-[#f4f4f5] transition-all cursor-pointer text-[11px]"
                  >
                    <Plus size={11} className="text-[#3b82f6]" />
                    <span>Attach Source</span>
                  </button>
                </AttachSourcePopover>
              </div>

              <div className="flex items-center gap-2">
                {/* Stop Generation button when streaming */}
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    aria-label="Stop generation"
                    title="Stop generation (Esc)"
                    className="arcade-btn px-2.5 py-1 flex items-center gap-1.5 bg-[#ef4444] hover:bg-[#dc2626] border border-[#ef4444] text-white text-xs font-bold transition-all cursor-pointer shadow-[2px_2px_0px_#000000]"
                  >
                    <Square size={10} className="fill-current" />
                    <span>STOP [ESC]</span>
                  </button>
                ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      aria-label="Send message"
                      title="Send message"
                      className={cn(
                        'w-7 h-7 flex items-center justify-center transition-all shrink-0 select-none border cursor-pointer',
                        input.trim()
                          ? 'bg-[#2563eb] border-[#3b82f6] text-white hover:bg-[#1d4ed8] shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px]'
                          : 'bg-[#141418] border-[#27272a] text-[#52525b] cursor-not-allowed'
                      )}
                    >
                      <ArrowUp size={13} className={input.trim() ? 'stroke-[3]' : 'text-[#52525b]'} />
                    </button>
                )}
              </div>
            </div>
          </form>

          {/* Monospace Keyboard Hints */}
          <div className="flex items-center justify-end gap-5 px-1 text-[11px] font-mono text-[#71717A] select-none">
            <span>shift+enter new line</span>
            <span>esc stop</span>
            <span>enter send</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
