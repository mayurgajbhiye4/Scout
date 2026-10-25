import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, type Session } from '@/api/sessions';
import { chatApi, type ChatMessage, type ResearchTrace } from '@/api/chat';
import { soundEffects } from '@/lib/soundEffects';
import { useRateLimit, rateLimitManager } from '@/lib/rateLimitManager';
import { applyResearchEvent, type ResearchActivityItem, type ResearchProgressEvent } from './researchProgress';

export type CopilotStatus = 'idle' | 'thinking' | 'streaming';

interface UseResearchChatOptions {
  sessionId: string | null;
  /** Called when the first message of a fresh conversation creates its session. */
  onSessionCreated?: (session: Session) => void;
}

type CitationList = NonNullable<ChatMessage['citations']>;

/** One server-sent event from the chat stream. */
interface ChatStreamEvent extends ResearchProgressEvent {
  step?: string;
  citations?: CitationList;
  delta?: string;
  done?: boolean;
  content?: string;
  message_id?: string;
  session_title?: string;
  session_summary?: string;
  suggestions?: string[];
  research_trace?: ResearchTrace | null;
  /** Sent instead of an answer when generation failed; the reply isn't saved server-side. */
  error?: string;
  error_code?: string;
}

interface RateLimitBody {
  error?: { message?: string; details?: { retry_after?: number } };
  detail?: string;
}

interface SessionTitleFields {
  id: string;
  title?: string;
  session_summary?: string | null;
}

/** Patches a session's title/summary in any cached shape: single session, list, or infinite-query pages. */
function patchSessionTitle(old: unknown, sessionId: string, title?: string, summary?: string): unknown {
  const patch = (s: SessionTitleFields) =>
    s.id === sessionId ? { ...s, title: title || s.title, session_summary: summary || s.session_summary } : s;
  if (!old || typeof old !== 'object') return old;
  if (Array.isArray(old)) return (old as SessionTitleFields[]).map(patch);
  const cache = old as { pages?: SessionTitleFields[][]; id?: string };
  if (Array.isArray(cache.pages)) return { ...cache, pages: cache.pages.map((page) => page.map(patch)) };
  if (cache.id) return patch(cache as SessionTitleFields);
  return old;
}

/**
 * Streaming research chat for one session. Extracted from LandingChatWindow so the copilot drawer
 * can stay mounted (and keep streaming) while it is collapsed.
 */
export function useResearchChat({ sessionId, onSessionCreated }: UseResearchChatOptions) {
  const queryClient = useQueryClient();
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const isRateLimited = isScopeRateLimited('chat:stream');
  const cooldownSec = getScopeSecondsLeft('chat:stream');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<CopilotStatus>('idle');
  const [step, setStep] = useState<string | null>(null);
  // Searches, evidence checks and retries of the reply in progress
  const [activity, setActivity] = useState<ResearchActivityItem[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const { data: session } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessionsApi.getSession(sessionId!),
    enabled: Boolean(sessionId),
  });

  const { data: history, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => chatApi.getMessages(sessionId!),
    enabled: Boolean(sessionId),
  });

  // Sync from the server, but never clobber a reply that is still streaming in — the session id
  // changes mid-stream when the first message creates the session.
  useEffect(() => {
    if (busyRef.current) return;
    setMessages(sessionId ? history ?? [] : []);
  }, [sessionId, history]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const replaceLast = (updater: (msg: ChatMessage) => ChatMessage) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), updater(last)];
    });

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busyRef.current) return false;
      if (isRateLimited) {
        soundEffects.playRateLimitWarning();
        return false;
      }

      busyRef.current = true;
      setStatus('thinking');
      setStep('Preparing research query');
      setActivity([]);

      let targetId = sessionId;
      if (!targetId) {
        try {
          const created = await sessionsApi.createSession({
            title: content.slice(0, 48),
            source_policy: 'source_first',
          });
          targetId = created.id;
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
          onSessionCreated?.(created);
        } catch (err) {
          console.error('Failed to create a session for the copilot:', err);
          busyRef.current = false;
          setStatus('idle');
          setStep(null);
          return false;
        }
      }

      const now = () => new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), session_id: targetId!, role: 'user', content, status: 'sent', created_at: now() },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      const assistantId = crypto.randomUUID();
      let answer = '';
      let citations: CitationList = [];

      try {
        const token = localStorage.getItem('airw_token') || localStorage.getItem('token');
        const response = await fetch(`/api/v1/chat/sessions/${targetId}/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content, force_web_search: webSearch }),
        });

        if (response.status === 429) {
          let body: RateLimitBody = {};
          try {
            body = await response.json();
          } catch {
            // ignore malformed error bodies
          }
          const retryHeader = response.headers.get('retry-after');
          const retryAfter = body.error?.details?.retry_after || (retryHeader ? parseInt(retryHeader, 10) : 30);
          const limitHeader = response.headers.get('x-ratelimit-limit');
          const message = body.error?.message || body.detail || 'Maximum 15 research chats per minute reached.';
          rateLimitManager.notify({
            scope: 'chat:stream',
            retryAfter,
            limit: limitHeader ? parseInt(limitHeader, 10) : 15,
            message,
            endpoint: `/api/v1/chat/sessions/${targetId}/chat`,
          });
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              session_id: targetId!,
              role: 'assistant',
              content: `**Chat limit reached.** ${message} You can send again in about ${retryAfter}s.`,
              status: 'error',
              created_at: now(),
            },
          ]);
          return true;
        }

        if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);

        setMessages((prev) => [
          ...prev,
          { id: assistantId, session_id: targetId!, role: 'assistant', content: '', status: 'streaming', created_at: now() },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let data: ChatStreamEvent;
            try {
              data = JSON.parse(raw);
            } catch (err) {
              console.error('SSE parse error:', err);
              continue;
            }

            if (data.error) {
              const reason = data.error;
              setStep(null);
              replaceLast((m) => ({ ...m, content: `*${reason}*`, status: 'error' }));
              continue;
            }

            if (data.status === 'step' || data.status === 'search' || data.status === 'evidence') {
              setActivity((prev) => applyResearchEvent(prev, data));
            }
            if ((data.status === 'step' || data.status === 'evidence') && data.step) {
              setStatus('thinking');
              setStep(data.step);
            }
            if (Array.isArray(data.citations)) citations = data.citations;

            if (data.delta) {
              setStatus('streaming');
              setStep(null);
              answer += data.delta;
              replaceLast((m) => ({ ...m, content: answer, status: 'streaming' }));
            }

            if (data.done) {
              soundEffects.playStreamComplete();
              const final = data.content || answer;
              replaceLast((m) => ({
                ...m,
                id: data.message_id || m.id,
                content: final,
                citations: citations.length > 0 ? citations : m.citations,
                suggested_questions: data.suggestions?.length ? data.suggestions : m.suggested_questions,
                research_trace: data.research_trace ?? m.research_trace,
                status: 'completed',
              }));
              if (data.session_title || data.session_summary) {
                queryClient.setQueryData(['sessions', targetId], (old: unknown) =>
                  patchSessionTitle(old, targetId!, data.session_title, data.session_summary)
                );
                queryClient.setQueriesData({ queryKey: ['sessions'] }, (old: unknown) =>
                  patchSessionTitle(old, targetId!, data.session_title, data.session_summary)
                );
              }
            } else if (data.content && !answer) {
              answer = data.content;
              replaceLast((m) => ({ ...m, content: answer, status: 'completed' }));
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          replaceLast((m) => ({ ...m, status: 'completed' }));
        } else {
          console.error('Copilot chat error:', err);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: `${last.content}\n\n*Generation stopped: the connection dropped.*`, status: 'error' }];
            }
            return [
              ...prev,
              {
                id: assistantId,
                session_id: targetId!,
                role: 'assistant',
                content: '*The research agent could not be reached. Check your connection and send again.*',
                status: 'error',
                created_at: now(),
              },
            ];
          });
        }
      } finally {
        abortRef.current = null;
        busyRef.current = false;
        setStatus('idle');
        setStep(null);
        setActivity([]);
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['chat', targetId] });
      }
      return true;
    },
    [isRateLimited, onSessionCreated, queryClient, sessionId, webSearch]
  );

  return {
    session,
    messages,
    status,
    step,
    activity,
    isLoadingHistory: Boolean(sessionId) && isLoadingHistory,
    send,
    stop,
    webSearch,
    setWebSearch,
    isRateLimited,
    cooldownSec,
  };
}
