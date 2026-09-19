import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeleteWorkspaceDialog from '../DeleteWorkspaceDialog';
import { workspacesApi, WorkspaceListItem } from '@/api/workspaces';

vi.mock('@/api/workspaces', () => ({
  workspacesApi: {
    delete: vi.fn(),
  },
}));

const mockWorkspace: WorkspaceListItem = {
  id: 'ws-123',
  name: 'Cancer Genomics 2026',
  description: 'Analysis of somatic mutations',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  source_count: 5,
  research_count: 3,
};

describe('DeleteWorkspaceDialog', () => {
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

  it('renders confirmation modal with workspace details', () => {
    render(
      <DeleteWorkspaceDialog
        workspace={mockWorkspace}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('heading', { name: 'Delete Workspace' })).toBeDefined();
    expect(screen.getByText(/Cancer Genomics 2026/)).toBeDefined();
    expect(screen.getByText(/This action cannot be undone/i)).toBeDefined();
    expect(screen.getByText(/5/)).toBeDefined(); // source count
    expect(screen.getByText(/3/)).toBeDefined(); // research count
  });

  it('calls workspacesApi.delete when clicking confirm', async () => {
    vi.mocked(workspacesApi.delete).mockResolvedValueOnce(undefined as any);
    const onClose = vi.fn();

    render(
      <DeleteWorkspaceDialog
        workspace={mockWorkspace}
        open={true}
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    const deleteBtn = screen.getByRole('button', { name: /delete workspace/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(workspacesApi.delete).toHaveBeenCalledWith('ws-123');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when clicking cancel', () => {
    const onClose = vi.fn();

    render(
      <DeleteWorkspaceDialog
        workspace={mockWorkspace}
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
