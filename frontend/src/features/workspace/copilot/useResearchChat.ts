import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, type Session } from '@/api/sessions';
import { chatApi } from '@/api/chat';
import { useRateLimit, rateLimitManager } from '@/lib/rateLimitManager';
import { chatReducer, INITIAL_CHAT_STATE, type ChatStreamEvent, type CopilotStatus } from './chatTurn';
import type { ResearchActivityItem } from './researchProgress';

export type { CopilotStatus };

interface UseResearchChatOptions {
  sessionId: string | null;
  /** Called when the first message of a fresh conversation creates its session. */
  onSessionCreated?: (session: Session) => void;
}

/** The turn in progress. Set synchronously, so it also stops a second send before React has re-rendered. */
interface RunningTurn {
  id: string;
  controller: AbortController;
  /** The session it writes to, once known. */
  sessionId: string | null;
}

const NO_ACTIVITY: ResearchActivityItem[] = [];

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

  const [{ messages, turn }, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const [webSearch, setWebSearch] = useState(false);
  const runningRef = useRef<RunningTurn | null>(null);

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

  // Opening a different conversation ends the reply in progress. The session id also changes mid-stream when
  // the first message creates the session, but then it changes to the turn's own session and the reply carries on.
  useEffect(() => {
    const running = runningRef.current;
    if (!running?.sessionId || running.sessionId === sessionId) return;
    running.controller.abort();
    runningRef.current = null;
    dispatch({ type: 'abandoned', turnId: running.id });
  }, [sessionId]);

  // The reducer ignores this while a reply is in progress, so a sync can't clobber it
  useEffect(() => {
    dispatch({ type: 'history', sessionId, history });
  }, [sessionId, history]);

  const stop = useCallback(() => {
    runningRef.current?.controller.abort();
  }, []);

  useEffect(() => () => runningRef.current?.controller.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || runningRef.current) return false;
      if (isRateLimited) {
        return false;
      }

      const turnId = crypto.randomUUID();
      const controller = new AbortController();
      const running: RunningTurn = { id: turnId, controller, sessionId };
      runningRef.current = running;
      const release = () => {
        if (runningRef.current === running) runningRef.current = null;
      };
      dispatch({ type: 'begin', turnId, sessionId });

      let targetId = sessionId;
      if (!targetId) {
        try {
          const created = await sessionsApi.createSession({
            title: content.slice(0, 48),
            source_policy: 'source_first',
          });
          targetId = created.id;
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
          if (controller.signal.aborted) {
            release();
            dispatch({ type: 'aborted', turnId });
            return false;
          }
          running.sessionId = created.id;
          onSessionCreated?.(created);
        } catch (err) {
          console.error('Failed to create a session for the copilot:', err);
          release();
          dispatch({ type: 'session_failed', turnId });
          return false;
        }
      }

      const now = () => new Date().toISOString();
      dispatch({
        type: 'request_started',
        turnId,
        sessionId: targetId!,
        userMessage: { id: crypto.randomUUID(), session_id: targetId!, role: 'user', content, status: 'sent', created_at: now() },
      });

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
          dispatch({
            type: 'rate_limited',
            turnId,
            content: `**Chat limit reached.** ${message} You can send again in about ${retryAfter}s.`,
            createdAt: now(),
          });
          return true;
        }

        if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);

        dispatch({ type: 'stream_opened', turnId, createdAt: now() });

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

            dispatch({ type: 'stream_event', turnId, event: data });

            if (data.done && (data.session_title || data.session_summary)) {
              queryClient.setQueryData(['sessions', targetId], (old: unknown) =>
                patchSessionTitle(old, targetId!, data.session_title, data.session_summary)
              );
              queryClient.setQueriesData({ queryKey: ['sessions'] }, (old: unknown) =>
                patchSessionTitle(old, targetId!, data.session_title, data.session_summary)
              );
            }
          }
        }
        dispatch({ type: 'stream_closed', turnId, createdAt: now() });
      } catch (err) {
        if (controller.signal.aborted) {
          dispatch({ type: 'aborted', turnId });
        } else {
          console.error('Copilot chat error:', err);
          dispatch({ type: 'connection_lost', turnId, createdAt: now() });
        }
      } finally {
        release();
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
    status: turn.phase as CopilotStatus,
    step: turn.step,
    // Searches, evidence checks and retries of the reply in progress
    activity: turn.phase === 'idle' ? NO_ACTIVITY : turn.activity,
    isLoadingHistory: Boolean(sessionId) && isLoadingHistory,
    send,
    stop,
    webSearch,
    setWebSearch,
    isRateLimited,
    cooldownSec,
  };
}
