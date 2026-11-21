import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/features/theme';
import FlowSources, { type FlowRow } from '../flow/FlowSources';
import type { AddSourceApi } from '../canvas/addSourceOptions';
import { useSourceIngest } from '../useWorkspaceData';

const attachSource = vi.fn();
const detachSource = vi.fn();
const createSource = vi.fn();
const uploadSource = vi.fn();
const uploadToSession = vi.fn();
vi.mock('@/api/sessions', () => ({
  sessionsApi: {
    attachSource: (...a: unknown[]) => attachSource(...a),
    detachSource: (...a: unknown[]) => detachSource(...a),
    uploadSource: (...a: unknown[]) => uploadToSession(...a),
  },
}));
vi.mock('@/api/sources', () => ({
  MAX_UPLOAD_MB: 1,
  sourcesApi: {
    createSource: (...a: unknown[]) => createSource(...a),
    uploadSource: (...a: unknown[]) => uploadSource(...a),
  },
}));

function addSourceApi(overrides: Partial<AddSourceApi> = {}): AddSourceApi {
  return {
    openLink: vi.fn(),
    pickFile: vi.fn(),
    dropSources: vi.fn(() => ({ added: 0, skipped: 0 })),
    disabled: false,
    cooldownSec: 0,
    element: null,
    ...overrides,
  };
}

function renderSources(rows: FlowRow[], props: Partial<React.ComponentProps<typeof FlowSources>> = {}) {
  const handlers = { onHoverSource: vi.fn(), onSelectSource: vi.fn(), onToggleCompare: vi.fn(), onSourceRemoved: vi.fn() };
  const addSource = props.addSource ?? addSourceApi();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <FlowSources
        sessionId={null}
        rows={rows}
        litIds={new Set()}
        selectedSourceId={null}
        comparedIds={new Set()}
        addSource={addSource}
        onRetryPending={vi.fn()}
        onDismissPending={vi.fn()}
        wide
        {...handlers}
        {...props}
      />
    </ThemeProvider>
    </QueryClientProvider>
  );
  return { ...handlers, addSource, queryClient };
}

describe('FlowSources', () => {
  it('removes a source from the session after confirming, and only in a session', async () => {
    detachSource.mockResolvedValue(undefined);
    const rows: FlowRow[] = [{ id: 's1', sourceId: 's1', kind: 'pdf', title: 'Paper', origin: 'arxiv.org' }];
    const { onSourceRemoved, onSelectSource, queryClient } = renderSources(rows, { sessionId: 'sess' });
    queryClient.setQueryData(['session-sources', 'sess', 'ids'], ['s1', 's2']);
    queryClient.setQueryData(['session-sources', 'sess', 'pages'], { pages: [[{ id: 's1' }, { id: 's2' }]], pageParams: [0] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Paper from this session' }));
    expect(onSelectSource).not.toHaveBeenCalled();
    expect(await screen.findByText('Remove “Paper” from this session?')).toBeInTheDocument();
    expect(detachSource).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onSourceRemoved).toHaveBeenCalledWith('s1'));
    expect(detachSource).toHaveBeenCalledWith('sess', 's1');
    expect(queryClient.getQueryData(['session-sources', 'sess', 'ids'])).toEqual(['s2']);
    expect(queryClient.getQueryData(['session-sources', 'sess', 'pages'])).toEqual({ pages: [[{ id: 's2' }]], pageParams: [0] });
    await waitFor(() => expect(screen.queryByText('Remove “Paper” from this session?')).toBeNull());
  });

  it('keeps the source when removing fails, and says why', async () => {
    detachSource.mockRejectedValue(new Error('boom'));
    const { onSourceRemoved } = renderSources([{ id: 's1', sourceId: 's1', kind: 'pdf', title: 'Paper', origin: 'arxiv.org' }], {
      sessionId: 'sess',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Paper from this session' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSourceRemoved).not.toHaveBeenCalled();
  });

  it('offers no remove button outside a session', () => {
    renderSources([{ id: 's1', sourceId: 's1', kind: 'pdf', title: 'Paper', origin: 'arxiv.org' }]);
    expect(screen.queryByRole('button', { name: /Remove Paper/ })).toBeNull();
  });

  it("lists the session's sources, and hovering or picking one reaches the map", () => {
    const { onHoverSource, onSelectSource } = renderSources([
      { id: 's1', sourceId: 's1', kind: 'pdf', title: 'Attention Is All You Need', origin: 'arxiv.org' },
      { id: 's2', sourceId: 's2', kind: 'github', title: 'karpathy/nanoGPT', origin: 'github.com' },
    ]);
    expect(screen.getByText('arxiv.org')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    const row = screen.getByRole('button', { name: /karpathy\/nanoGPT/ });
    fireEvent.mouseEnter(row);
    expect(onHoverSource).toHaveBeenLastCalledWith('s2');
    fireEvent.click(row);
    expect(onSelectSource).toHaveBeenLastCalledWith('s2');
  });

  it('Ctrl or ⌘ click compares a source, a plain click narrows to it', () => {
    const { onSelectSource, onToggleCompare } = renderSources(
      [{ id: 's1', sourceId: 's1', kind: 'pdf', title: 'Paper', origin: 'arxiv.org' }],
      { comparedIds: new Set(['s1', 's9']) }
    );
    const row = screen.getByRole('button', { name: /Paper/ });
    expect(row).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(row, { ctrlKey: true });
    fireEvent.click(row, { metaKey: true });
    expect(onToggleCompare).toHaveBeenCalledTimes(2);
    expect(onSelectSource).not.toHaveBeenCalled();

    fireEvent.click(row);
    expect(onSelectSource).toHaveBeenLastCalledWith('s1');
  });

  it('shows a source being added with its progress', () => {
    renderSources([
      {
        id: 'pending:t1',
        kind: 'youtube',
        title: 'youtube.com/watch?v=kCc8FmEb1nY',
        origin: '',
        pending: { tempId: 't1', kind: 'youtube', title: 'youtube.com/watch?v=kCc8FmEb1nY', input: 'x', status: 'ingesting', phase: 'reading' },
      },
    ]);
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('offers each kind of source while the session is empty', () => {
    const { addSource } = renderSources([]);
    fireEvent.click(screen.getByRole('button', { name: /YouTube video/ }));
    expect(addSource.openLink).toHaveBeenCalledWith('youtube');
    fireEvent.click(screen.getByRole('button', { name: /File upload/ }));
    expect(addSource.pickFile).toHaveBeenCalled();
  });
});

describe('useSourceIngest', () => {
  beforeEach(() => {
    attachSource.mockReset();
    createSource.mockReset();
  });

  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

  it('starts a session for a source added before there is one, and adds the source to it', async () => {
    attachSource.mockResolvedValue({ id: 'src1', title: 'A paper', status: 'indexed', chunk_count: 3 });
    const ensureSession = vi.fn().mockResolvedValue('session-1');
    const { result } = renderHook(() => useSourceIngest(null, ensureSession), { wrapper });

    act(() => result.current.ingest('web', 'https://arxiv.org/abs/1706.03762'));

    await waitFor(() => expect(attachSource).toHaveBeenCalledWith('session-1', expect.objectContaining({ url: 'https://arxiv.org/abs/1706.03762' })));
    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(createSource).not.toHaveBeenCalled();
  });

  it('adds straight to the open session without starting another', async () => {
    attachSource.mockResolvedValue({ id: 'src1', title: 'A paper', status: 'indexed', chunk_count: 3 });
    const ensureSession = vi.fn();
    const { result } = renderHook(() => useSourceIngest('open-session', ensureSession), { wrapper });

    act(() => result.current.ingest('web', 'https://example.com/post'));

    await waitFor(() => expect(attachSource).toHaveBeenCalledWith('open-session', expect.anything()));
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('drops its row instead of claiming ready when the server is already ingesting that URL', async () => {
    createSource.mockResolvedValue({ id: 'src1', title: 'A paper', status: 'processing' });
    const { result } = renderHook(() => useSourceIngest(null), { wrapper });

    act(() => result.current.ingest('web', 'https://example.com/post'));
    expect(result.current.pending).toHaveLength(1);

    await waitFor(() => expect(result.current.pending).toHaveLength(0));
  });

  it("shows why ingestion failed when the embedding model is down, instead of claiming it's ready", async () => {
    const reason = 'Ingestion failed: the embedding model is unavailable. Try again in a moment.';
    createSource.mockResolvedValue({ id: 'src1', title: 'A paper', status: 'failed', metadata: { error: reason } });
    const { result } = renderHook(() => useSourceIngest(null), { wrapper });

    act(() => result.current.ingest('web', 'https://example.com/post'));

    await waitFor(() => expect(result.current.pending[0]).toMatchObject({ status: 'failed', error: reason }));
  });

  it('only retries a failed row, once', async () => {
    createSource.mockRejectedValueOnce(new Error('nope')).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSourceIngest(null), { wrapper });

    act(() => result.current.ingest('web', 'https://example.com/post'));
    await waitFor(() => expect(result.current.pending[0]).toMatchObject({ status: 'failed', error: 'nope' }));

    const tempId = result.current.pending[0]!.tempId;
    act(() => result.current.retry(tempId));
    expect(result.current.pending[0]).toMatchObject({ status: 'ingesting', phase: 'reading' });
    act(() => result.current.retry(tempId));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(2));
  });
});

describe('useSourceIngest with a file', () => {
  beforeEach(() => {
    attachSource.mockReset();
    createSource.mockReset();
    uploadSource.mockReset();
    uploadToSession.mockReset();
  });

  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
  const pdf = (bytes = 10) => new File([new Uint8Array(bytes)], 'paper.pdf', { type: 'application/pdf' });

  it('uploads the file into the open session instead of sending it as a link or text', async () => {
    uploadToSession.mockResolvedValue({ id: 'src1', title: 'Attention', status: 'indexed', chunk_count: 4 });
    const file = pdf();
    const { result } = renderHook(() => useSourceIngest('open-session'), { wrapper });

    act(() => result.current.ingest('pdf', file.name, file));

    await waitFor(() => expect(uploadToSession).toHaveBeenCalledWith('open-session', file));
    expect(attachSource).not.toHaveBeenCalled();
    // The server's title (from the PDF) replaces the file name
    await waitFor(() => expect(result.current.pending[0]).toMatchObject({ status: 'ready', title: 'Attention' }));
  });

  it('uploads to the library when there is no session', async () => {
    uploadSource.mockResolvedValue({ id: 'src1', title: 'paper', status: 'indexed', chunk_count: 1 });
    const file = pdf();
    const { result } = renderHook(() => useSourceIngest(null), { wrapper });

    act(() => result.current.ingest('pdf', file.name, file));

    await waitFor(() => expect(uploadSource).toHaveBeenCalledWith(file));
    expect(createSource).not.toHaveBeenCalled();
  });

  it('refuses a file over the size limit without sending it', async () => {
    const file = pdf(1024 * 1024 + 1);
    const { result } = renderHook(() => useSourceIngest(null), { wrapper });

    act(() => result.current.ingest('pdf', file.name, file));

    await waitFor(() =>
      expect(result.current.pending[0]).toMatchObject({ status: 'failed', error: 'paper.pdf is larger than the 1 MB limit.' })
    );
    expect(uploadSource).not.toHaveBeenCalled();
  });

  it('retries a failed upload with the same file', async () => {
    uploadSource.mockRejectedValueOnce(new Error('network down')).mockResolvedValue({ id: 'src1', title: 'paper', status: 'indexed' });
    const file = pdf();
    const { result } = renderHook(() => useSourceIngest(null), { wrapper });

    act(() => result.current.ingest('pdf', file.name, file));
    await waitFor(() => expect(result.current.pending[0]).toMatchObject({ status: 'failed' }));

    act(() => result.current.retry(result.current.pending[0]!.tempId));

    await waitFor(() => expect(uploadSource).toHaveBeenCalledTimes(2));
    expect(uploadSource).toHaveBeenLastCalledWith(file);
  });
});
