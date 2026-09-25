import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Sparkles,
  ArrowUp,
  User,
  Trash2,
  Loader2,
  Globe,
  BrainCircuit,
  Copy,
  Check,
} from 'lucide-react';
import { sessionsApi } from '@/api/sessions';
import { chatApi, ChatMessage } from '@/api/chat';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import DeleteSessionDialog from '@/features/research/DeleteSessionDialog';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';

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
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef<string | null>(null);

  // Fetch session details
  const { data: session } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessionsApi.getSession(sessionId),
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

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, isThinking]);

  // Execute a message send and stream response
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

    try {
      const token = localStorage.getItem('airw_token') || localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/v1/chat/sessions/${sessionId}/chat`, {
        method: 'POST',
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
      const tempAsstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempAsstMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.status === 'processing') {
                setIsThinking(true);
              }
              if (data.content) {
                setIsThinking(false);
                asstContent = data.content;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = {
                    ...tempAsstMsg,
                    content: asstContent,
                    status: 'completed',
                  };
                  return newMsgs;
                });
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }

      // Invalidate queries so session title / last activity updates in sidebar
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', sessionId] });
    } catch (err) {
      console.error('Chat execution error:', err);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
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
        'relative flex-1 min-h-0 w-full max-w-[940px] h-full max-h-[1000px] my-auto flex flex-col',
        // Liquid glass base
        'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
        'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
        'shadow-[var(--pill-shadow)]',
        'rounded-[34px] overflow-hidden',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'animate-in fade-in zoom-in-95 duration-200'
      )}
    >
      {/* ── TOP HEADER BAR ── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/[0.08] shrink-0 backdrop-blur-md select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Explore button */}
          <button
            onClick={onClose}
            title="Back to explore"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08] border border-transparent hover:border-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Explore</span>
          </button>

          <div className="h-4 w-px bg-white/10 shrink-0" />

          {/* Session Title & Metadata */}
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-semibold text-[#F4F4F5] truncate max-w-[240px] sm:max-w-[400px]">
              {session?.title || 'Research Session'}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-[#71717A]">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E4E4E7] shadow-[0_0_6px_rgba(228,228,231,0.5)]" />
                {session?.mode === 'deep_research' ? 'Deep Research' : 'Autonomous Agent'}
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

        {/* Right Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setForceWebSearch((prev) => !prev)}
            title={forceWebSearch ? 'Live Web Search Active' : 'Grounding with Session Sources'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer',
              forceWebSearch
                ? 'bg-white/[0.12] border-white/25 text-[#F4F4F5] shadow-xs'
                : 'bg-white/[0.04] border-white/10 text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.08]'
            )}
          >
            <Globe size={12} className={forceWebSearch ? 'text-[#E4E4E7]' : ''} />
            <span className="hidden sm:inline">Web Search</span>
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            title="Delete session"
            className="p-1.5 rounded-full text-[#71717A] hover:text-[#EF4444] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {/* ── MESSAGES SCROLL AREA ── */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-5 space-y-6 sidebar-scroll"
      >
        {isLoadingMessages ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-[#71717A]">
            <Loader2 size={24} className="animate-spin text-[#E4E4E7]" />
            <span className="text-xs">Loading research thread...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mb-4 shadow-sm">
              <Sparkles size={22} className="text-[#E4E4E7]" />
            </div>
            <h3 className="text-base font-semibold text-[#F4F4F5] mb-1">
              {session?.title || 'Start Exploring'}
            </h3>
            <p className="text-xs text-[#A1A1AA] max-w-sm mb-6 leading-relaxed">
              Ask questions to analyze indexed documents, synthesize literature, or formulate deep research hypotheses.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id || idx}
                className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start items-start')}
              >
                {/* Assistant avatar */}
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/12 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Sparkles size={14} className="text-[#E4E4E7]" />
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={cn(
                    'text-sm leading-relaxed transition-all select-text',
                    isUser
                      ? 'max-w-[85%] sm:max-w-[78%] rounded-[22px] px-4 py-3 bg-white/[0.12] text-[#F4F4F5] border border-white/12 shadow-[0_2px_12px_rgba(0,0,0,0.3)]'
                      : 'max-w-[92%] sm:max-w-[86%] rounded-[24px] px-5 py-4 bg-white/[0.04] text-[#E4E4E7] border border-white/[0.08] shadow-[0_2px_16px_rgba(0,0,0,0.2)]'
                  )}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap font-normal">{msg.content}</div>
                  ) : (
                    <div>
                      {/* Markdown rendered content */}
                      {msg.content ? (
                        <MarkdownRenderer content={msg.content} />
                      ) : isStreaming && idx === messages.length - 1 ? (
                        <div className="flex items-center gap-2 py-1 text-xs text-[#A1A1AA]">
                          <Loader2 size={13} className="animate-spin text-[#E4E4E7]" />
                          <span>Generating response...</span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#71717A] italic">Empty message</span>
                      )}

                      {/* Footer actions for assistant */}
                      {msg.content && (
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.06] text-[11px] text-[#71717A]">
                          <span className="flex items-center gap-1.5">
                            <BrainCircuit size={11} className="text-[#E4E4E7]" />
                            <span>Scout Research Model</span>
                          </span>
                          <button
                            onClick={() => handleCopy(msg.id || String(idx), msg.content)}
                            title="Copy response"
                            className="flex items-center gap-1 hover:text-[#F4F4F5] transition-colors p-1 rounded-md hover:bg-white/[0.06] cursor-pointer"
                          >
                            {copiedId === (msg.id || String(idx)) ? (
                              <>
                                <Check size={11} className="text-[#10B981]" />
                                <span className="text-[#10B981]">Copied</span>
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
                  <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5 shadow-xs text-xs font-medium text-[#F4F4F5]">
                    <User size={13} />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Thinking Indicator */}
        {isThinking && (
          <div className="flex items-center gap-3 animate-in fade-in duration-200">
            <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/12 flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles size={14} className="text-[#E4E4E7]" />
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.05] border border-white/10 text-xs text-[#A1A1AA] shadow-xs">
              <Loader2 size={12} className="animate-spin text-[#E4E4E7]" />
              <span>Analyzing sources & synthesizing evidence...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── BOTTOM INPUT STUDIO ── */}
      <footer className="shrink-0 p-3 sm:p-4 border-t border-white/[0.08] bg-white/[0.02] backdrop-blur-md">
        <form
          onSubmit={handleSubmit}
          className={cn(
            'relative flex flex-col w-full rounded-[24px]',
            'bg-white/[0.05] border border-white/12',
            'focus-within:border-white/25 focus-within:bg-white/[0.08]',
            'shadow-[0_4px_24px_rgba(0,0,0,0.4)]',
            'transition-all duration-200 ease-out p-3'
          )}
        >
          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question, request synthesis, or cross-examine sources..."
            rows={2}
            className="w-full bg-transparent text-sm text-[#F4F4F5] placeholder-[#71717A] resize-none outline-none border-0 focus:ring-0 leading-relaxed font-normal sidebar-scroll max-h-[120px]"
          />

          {/* Controls row */}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/[0.05]">
            <div className="flex items-center gap-2 text-[11px] text-[#71717A]">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                <BrainCircuit size={11} className="text-[#E4E4E7]" />
                <span>Deep Search Grounded</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                aria-label="Send message"
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 select-none cursor-pointer',
                  input.trim() && !isStreaming
                    ? 'bg-white text-black shadow-[0_2px_10px_rgba(255,255,255,0.2)] hover:scale-105 hover:bg-[#F4F4F5] active:scale-95'
                    : 'bg-white/10 text-[#71717A] cursor-not-allowed opacity-40'
                )}
              >
                {isStreaming ? (
                  <Loader2 size={14} className="animate-spin text-black" />
                ) : (
                  <ArrowUp size={15} className="stroke-[2.5]" />
                )}
              </button>
            </div>
          </div>
        </form>
      </footer>

      {/* Delete session confirmation dialog */}
      <DeleteSessionDialog
        session={session || null}
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onSuccess={() => {
          setShowDeleteModal(false);
          onSessionDeleted?.();
          onClose();
        }}
      />
    </div>
  );
}
