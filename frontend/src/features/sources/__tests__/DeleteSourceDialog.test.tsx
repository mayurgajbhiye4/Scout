import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeleteSourceDialog from '../DeleteSourceDialog';
import { sourcesApi, Source } from '@/api/sources';

vi.mock('@/api/sources', () => ({
  sourcesApi: {
    deleteSource: vi.fn(),
  },
}));

const mockSource: Source = {
  id: 'source-789',
  workspace_id: 'ws-123',
  type: 'web',
  title: 'Nature: CRISPR Gene Editing Breakthrough',
  url: 'https://www.nature.com/articles/crispr-2026',
  external_id: null,
  metadata_: { publisher: 'Nature' },
  created_at: '2026-01-01T00:00:00Z',
};

describe('DeleteSourceDialog', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  it('renders confirmation modal with source details', () => {
    render(
      <DeleteSourceDialog
        workspaceId="ws-123"
        source={mockSource}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('heading', { name: 'Delete Knowledge Source' })).toBeDefined();
    expect(screen.getByText('Nature: CRISPR Gene Editing Breakthrough')).toBeDefined();
    expect(screen.getByText(/Type: web/i)).toBeDefined();
    expect(screen.getByText(/https:\/\/www.nature.com\/articles\/crispr-2026/i)).toBeDefined();
    expect(screen.getByText(/This action cannot be undone/i)).toBeDefined();
  });

  it('calls sourcesApi.deleteSource when confirming deletion', async () => {
    vi.mocked(sourcesApi.deleteSource).mockResolvedValueOnce(undefined as any);
    const onClose = vi.fn();

    render(
      <DeleteSourceDialog
        workspaceId="ws-123"
        source={mockSource}
        open={true}
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    const deleteBtn = screen.getByRole('button', { name: /delete source/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(sourcesApi.deleteSource).toHaveBeenCalledWith('ws-123', 'source-789');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when clicking cancel button', () => {
    const onClose = vi.fn();

    render(
      <DeleteSourceDialog
        workspaceId="ws-123"
        source={mockSource}
        open={true}
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
