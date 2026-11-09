import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ChatMessage } from '@/api/chat';
import { useResearchChat } from '../copilot/useResearchChat';

const getMessages = vi.fn();
const createSession = vi.fn();
vi.mock('@/api/chat', () => ({ chatApi: { getMessages: (...a: unknown[]) => getMessages(...a) } }));
vi.mock('@/api/sessions', () => ({
  sessionsApi: {
    getSession: vi.fn(async (id: string) => ({ id, title: 'Session' })),
    createSession: (...a: unknown[]) => createSession(...a),
  },
}));

const message = (id: string, role: ChatMessage['role'], content: string, session_id = 'a'): ChatMessage => ({
  id,
  session_id,
  role,
  content,
  status: 'completed',
  created_at: '2026-01-01T00:00:00Z',
});

/** A chat response whose events the test feeds in by hand. */
function controllableStream(signal?: AbortSignal | null) {
  const encoder = new TextEncoder();
  let pending: { resolve: (r: ReadableStreamReadResult<Uint8Array>) => void; reject: (e: unknown) => void } | null = null;
  const queued: Array<ReadableStreamReadResult<Uint8Array>> = [];
  const push = (r: ReadableStreamReadResult<Uint8Array>) => {
    if (pending) {
      pending.resolve(r);
      pending = null;
    } else {
      queued.push(r);
    }
  };
  signal?.addEventListener('abort', () => {
    pending?.reject(new DOMException('Aborted', 'AbortError'));
    pending = null;
  });
  return {
    response: {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: {
        getReader: () => ({
          read: () =>
            new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
              const next = queued.shift();
              if (next) resolve(next);
              else pending = { resolve, reject };
            }),
        }),
      },
    } as unknown as Response,
    event: (data: object) => push({ done: false, value: encoder.encode(`data: ${JSON.stringify(data)}\n\n`) }),
    close: () => push({ done: true, value: undefined }),
  };
}

function setup(initialSessionId: string | null, onSessionCreated?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ sessionId }: { sessionId: string | null }) => useResearchChat({ sessionId, onSessionCreated }), {
    wrapper,
    initialProps: { sessionId: initialSessionId },
  });
}

async function startTurn(result: ReturnType<typeof setup>['result'], text = 'Question?') {
  let stream!: ReturnType<typeof controllableStream>;
  vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
    stream = controllableStream(init?.signal);
    return stream.response;
  });
  act(() => {
    void result.current.send(text);
  });
  await waitFor(() => expect(result.current.messages.at(-1)?.role).toBe('assistant'));
  return stream;
}

const lastContents = (messages: ChatMessage[]) => messages.map((m) => m.content);

describe('useResearchChat turn lifecycle', () => {
  beforeEach(() => {
    getMessages.mockReset();
    createSession.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('walks thinking, streaming and back to idle with the saved answer', async () => {
    getMessages.mockResolvedValue([]);
    const { result } = setup('a');
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    const stream = await startTurn(result);

    expect(result.current.status).toBe('thinking');
    act(() => stream.event({ status: 'step', stage: 'retrieve', step: 'Searching' }));
    await waitFor(() => expect(result.current.step).toBe('Searching'));

    act(() => stream.event({ delta: 'Hello' }));
    await waitFor(() => expect(result.current.status).toBe('streaming'));
    expect(result.current.step).toBeNull();

    act(() => stream.event({ done: true, content: 'Hello world', message_id: 'server-1', citations: [] }));
    await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ id: 'server-1', status: 'completed' }));

    getMessages.mockResolvedValue([message('u1', 'user', 'Question?'), message('server-1', 'assistant', 'Hello world')]);
    act(() => stream.close());
    await waitFor(() => expect(result.current.status).toBe('idle'));
    await waitFor(() => expect(lastContents(result.current.messages)).toEqual(['Question?', 'Hello world']));
  });

  it('keeps a failed reply on screen after history refetches without it', async () => {
    getMessages.mockResolvedValue([]);
    const { result } = setup('a');
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    const stream = await startTurn(result);

    getMessages.mockResolvedValue([message('u1', 'user', 'Question?')]);
    act(() => {
      stream.event({ error: 'Credits exhausted', error_code: 'provider_credits' });
      stream.close();
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    await waitFor(() => expect(getMessages.mock.calls.length).toBeGreaterThan(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(lastContents(result.current.messages)).toEqual(['Question?', '*Credits exhausted*']);
    expect(result.current.messages.at(-1)?.status).toBe('error');
  });

  it('keeps a partial answer on screen after the user stops it', async () => {
    getMessages.mockResolvedValue([]);
    const { result } = setup('a');
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    const stream = await startTurn(result);
    act(() => stream.event({ delta: 'Partial' }));
    await waitFor(() => expect(result.current.status).toBe('streaming'));

    getMessages.mockResolvedValue([message('u1', 'user', 'Question?')]);
    act(() => result.current.stop());

    await waitFor(() => expect(result.current.status).toBe('idle'));
    await waitFor(() => expect(getMessages.mock.calls.length).toBeGreaterThan(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(lastContents(result.current.messages)).toEqual(['Question?', 'Partial']);
  });

  it('marks a reply as failed when the stream closes without a final event', async () => {
    getMessages.mockResolvedValue([]);
    const { result } = setup('a');
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    const stream = await startTurn(result);
    act(() => {
      stream.event({ delta: 'Half an ans' });
      stream.close();
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.messages.at(-1)?.status).toBe('error');
    expect(result.current.messages.at(-1)?.content).toContain('Half an ans');
  });

  it('cancels the running reply when another session opens, and shows only that session', async () => {
    getMessages.mockImplementation(async (id: string) => (id === 'b' ? [message('b1', 'assistant', 'Answer from B', 'b')] : []));
    const { result, rerender } = setup('a');
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('a'));
    const stream = await startTurn(result);
    act(() => stream.event({ delta: 'Answer for A' }));
    await waitFor(() => expect(result.current.status).toBe('streaming'));

    rerender({ sessionId: 'b' });

    await waitFor(() => expect(lastContents(result.current.messages)).toEqual(['Answer from B']));
    expect(result.current.status).toBe('idle');
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.signal?.aborted).toBe(true);
  });

  it('keeps streaming when the first message creates the session being opened', async () => {
    createSession.mockResolvedValue({ id: 'new', title: 'Question?' });
    getMessages.mockResolvedValue([]);
    const { result, rerender } = setup(null);
    const stream = await startTurn(result);

    rerender({ sessionId: 'new' });
    act(() => stream.event({ delta: 'Still here' }));

    await waitFor(() => expect(result.current.messages.at(-1)?.content).toBe('Still here'));
    expect(result.current.status).toBe('streaming');
  });

  it('honours stop while the session is still being created', async () => {
    let finishCreate!: (s: { id: string }) => void;
    createSession.mockImplementation(() => new Promise((resolve) => (finishCreate = resolve)));
    const onSessionCreated = vi.fn();
    const { result } = setup(null, onSessionCreated);

    act(() => {
      void result.current.send('Question?');
    });
    await waitFor(() => expect(result.current.status).toBe('thinking'));
    act(() => result.current.stop());
    await act(async () => finishCreate({ id: 'new' }));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(fetch).not.toHaveBeenCalled();
    expect(onSessionCreated).not.toHaveBeenCalled();
  });
});
