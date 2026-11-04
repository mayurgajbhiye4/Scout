import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/features/theme';
import FlowSources, { type FlowRow } from '../flow/FlowSources';
import type { AddSourceApi } from '../canvas/addSourceOptions';
import { useSourceIngest } from '../useWorkspaceData';

const attachSource = vi.fn();
const createSource = vi.fn();
vi.mock('@/api/sessions', () => ({ sessionsApi: { attachSource: (...a: unknown[]) => attachSource(...a) } }));
vi.mock('@/api/sources', () => ({ sourcesApi: { createSource: (...a: unknown[]) => createSource(...a) } }));

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
  const handlers = { onHoverSource: vi.fn(), onSelectSource: vi.fn() };
  const addSource = props.addSource ?? addSourceApi();
  render(
    <ThemeProvider>
      <FlowSources
        rows={rows}
        litIds={new Set()}
        selectedSourceId={null}
        addSource={addSource}
        onRetryPending={vi.fn()}
        onDismissPending={vi.fn()}
        rowRef={() => () => {}}
        listRef={null}
        onListScroll={() => {}}
        wide
        {...handlers}
        {...props}
      />
    </ThemeProvider>
  );
  return { ...handlers, addSource };
}

describe('FlowSources', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Text or Markdown file/ }));
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
});
