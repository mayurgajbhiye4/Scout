import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/features/theme';
import FlowSources, { type FlowRow } from '../flow/FlowSources';
import SourcesDock from '../canvas/SourcesDock';
import type { AddSourceApi } from '../canvas/addSourceOptions';
import { useSourceLookup, withoutSource } from '../useWorkspaceData';

const listSources = vi.fn();
const getCounts = vi.fn();
vi.mock('@/api/sources', () => ({
  MAX_UPLOAD_MB: 1,
  sourcesApi: {
    listSources: (...a: unknown[]) => listSources(...a),
    getCounts: (...a: unknown[]) => getCounts(...a),
    deleteSource: vi.fn(),
  },
}));
vi.mock('@/api/sessions', () => ({ sessionsApi: {} }));

// jsdom has no IntersectionObserver; this one lets a test say when the list's end comes into view
let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
class FakeObserver {
  constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {}
  observe() {
    observed.push(this.cb);
  }
  disconnect() {
    observed = observed.filter((cb) => cb !== this.cb);
  }
}
const scrollToEnd = () => act(() => observed.forEach((cb) => cb([{ isIntersecting: true }])));

beforeEach(() => {
  observed = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  listSources.mockReset();
  getCounts.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function addSourceApi(): AddSourceApi {
  return { openLink: vi.fn(), pickFile: vi.fn(), dropSources: vi.fn(() => ({ added: 0, skipped: 0 })), disabled: false, cooldownSec: 0, element: null };
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrap(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const source = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `s${i}`,
  title: `Source ${i}`,
  source_type: 'website',
  canonical_uri: `https://example.com/${i}`,
  status: 'indexed',
  ...extra,
});

describe('session sources column', () => {
  const rows: FlowRow[] = Array.from({ length: 3 }, (_, i) => ({
    id: `s${i}`,
    sourceId: `s${i}`,
    kind: 'web',
    title: `Source ${i}`,
    origin: 'example.com',
  }));

  it("counts every source in the session, and loads the next page when the list's end shows", () => {
    const onLoadMore = vi.fn();
    render(
      <FlowSources
        rows={rows}
        total={12}
        hasMore
        onLoadMore={onLoadMore}
        litIds={new Set()}
        selectedSourceId={null}
        comparedIds={new Set()}
        onHoverSource={vi.fn()}
        onSelectSource={vi.fn()}
        onToggleCompare={vi.fn()}
        addSource={addSourceApi()}
        onRetryPending={vi.fn()}
        onDismissPending={vi.fn()}
        sessionId={null}
        onSourceRemoved={vi.fn()}
        wide
      />,
      { wrapper: wrap(client()) }
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(onLoadMore).not.toHaveBeenCalled();
    scrollToEnd();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing more once every page is in', () => {
    const onLoadMore = vi.fn();
    render(
      <FlowSources
        rows={rows}
        total={3}
        hasMore={false}
        onLoadMore={onLoadMore}
        litIds={new Set()}
        selectedSourceId={null}
        comparedIds={new Set()}
        onHoverSource={vi.fn()}
        onSelectSource={vi.fn()}
        onToggleCompare={vi.fn()}
        addSource={addSourceApi()}
        onRetryPending={vi.fn()}
        onDismissPending={vi.fn()}
        sessionId={null}
        onSourceRemoved={vi.fn()}
        wide
      />,
      { wrapper: wrap(client()) }
    );
    scrollToEnd();
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});

describe('sources library', () => {
  function renderDock() {
    return render(
      <SourcesDock
        isAuthenticated
        onSignIn={vi.fn()}
        pending={[]}
        sessionSourceIds={new Set()}
        entityCountBySource={new Map()}
        hoveredSourceId={null}
        selectedSourceId={null}
        onHoverSource={vi.fn()}
        onSelectSource={vi.fn()}
        focusEntity={null}
        focusSourceIds={null}
        onClearEntity={vi.fn()}
        onAskAboutSource={vi.fn()}
        addSource={addSourceApi()}
        onRetryPending={vi.fn()}
        onDismissPending={vi.fn()}
      />,
      { wrapper: wrap(client()) }
    );
  }

  it('loads one page, then the next only as the list is scrolled to its end', async () => {
    getCounts.mockResolvedValue({ total: 25, by_kind: { pdf: 0, youtube: 0, github: 0, web: 25, notes: 0 } });
    listSources.mockImplementation(({ skip }: { skip: number }) =>
      Promise.resolve(Array.from({ length: skip === 0 ? 20 : 5 }, (_, i) => source(skip + i)))
    );
    renderDock();

    expect(await screen.findByText('Source 19')).toBeInTheDocument();
    expect(listSources).toHaveBeenCalledTimes(1);
    expect(listSources).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, limit: 20 }));
    // The heading counts the whole library, not just the page in
    expect(await screen.findByText('25', { selector: 'h2 span' })).toBeInTheDocument();

    scrollToEnd();
    expect(await screen.findByText('Source 24')).toBeInTheDocument();
    expect(listSources).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 20, limit: 20 }));

    // A short page was the last one
    scrollToEnd();
    expect(listSources).toHaveBeenCalledTimes(2);
  });

  it('searches and filters on the server', async () => {
    getCounts.mockResolvedValue({ total: 3, by_kind: { pdf: 1, youtube: 0, github: 2, web: 0, notes: 0 } });
    listSources.mockResolvedValue([source(1)]);
    renderDock();
    await screen.findByText('Source 1');

    fireEvent.change(screen.getByLabelText('Search sources'), { target: { value: 'graph' } });
    await waitFor(() => expect(listSources).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'graph', skip: 0 })));

    fireEvent.click(screen.getByRole('tab', { name: /GitHub/ }));
    await waitFor(() =>
      expect(listSources).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'graph', kind: 'github', skip: 0 }))
    );
    // Chip counts come from the server's totals
    expect(screen.getByRole('tab', { name: /GitHub/ })).toHaveTextContent('2');
  });
});

describe('source lookup', () => {
  it('fetches by id only the sources no list has loaded', async () => {
    const queryClient = client();
    queryClient.setQueryData(['session-sources', 'sess', 'pages'], { pages: [[source(1)]], pageParams: [0] });
    listSources.mockResolvedValue([source(2)]);

    const { result } = renderHook(() => useSourceLookup(true, ['s1', 's2']), { wrapper: wrap(queryClient) });
    expect(result.current.sourcesById.has('s1')).toBe(true);
    expect(result.current.isResolving('s2')).toBe(true);

    await waitFor(() => expect(result.current.sourcesById.has('s2')).toBe(true));
    expect(listSources).toHaveBeenCalledTimes(1);
    expect(listSources).toHaveBeenCalledWith(expect.objectContaining({ ids: ['s2'] }));
  });

  it('stops resolving an id the server no longer has, so a selection of it can clear', async () => {
    listSources.mockResolvedValue([]);
    const { result } = renderHook(() => useSourceLookup(true, ['gone']), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.isResolving('gone')).toBe(false));
    expect(result.current.sourcesById.has('gone')).toBe(false);
  });
});

describe('withoutSource', () => {
  it('drops a source from pages of sources and from a list of ids', () => {
    expect(withoutSource({ pages: [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]], pageParams: [0, 20] }, 'b')).toEqual({
      pages: [[{ id: 'a' }], [{ id: 'c' }]],
      pageParams: [0, 20],
    });
    expect(withoutSource(['a', 'b'], 'a')).toEqual(['b']);
    expect(withoutSource(undefined, 'a')).toBeUndefined();
  });
});
