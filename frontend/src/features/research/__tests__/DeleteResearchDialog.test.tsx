import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeleteResearchDialog from '../DeleteResearchDialog';
import { researchApi, ResearchSession } from '@/api/research';

vi.mock('@/api/research', () => ({
  researchApi: {
    deleteSession: vi.fn(),
  },
}));

const mockSession: ResearchSession = {
  id: 'session-456',
  workspace_id: 'ws-123',
  question: 'What are the current immunotherapy targets in non-small cell lung cancer?',
  status: 'completed',
  research_depth: 'deep',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:05:00Z',
  error_message: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:05:00Z',
};

describe('DeleteResearchDialog', () => {
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

  it('renders confirmation modal with research question and warning details', () => {
    render(
      <DeleteResearchDialog
        workspaceId="ws-123"
        session={mockSession}
        open={true}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('heading', { name: 'Delete Research Session' })).toBeDefined();
    expect(screen.getByText(/What are the current immunotherapy targets/)).toBeDefined();
    expect(screen.getByText(/Depth: deep/i)).toBeDefined();
    expect(screen.getByText(/Status: completed/i)).toBeDefined();
    expect(screen.getByText(/This action cannot be undone/i)).toBeDefined();
  });

  it('calls researchApi.deleteSession when confirming deletion', async () => {
    vi.mocked(researchApi.deleteSession).mockResolvedValueOnce(undefined as any);
    const onClose = vi.fn();

    render(
      <DeleteResearchDialog
        workspaceId="ws-123"
        session={mockSession}
        open={true}
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    const deleteBtn = screen.getByRole('button', { name: /delete research/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(researchApi.deleteSession).toHaveBeenCalledWith('ws-123', 'session-456');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when clicking cancel button', () => {
    const onClose = vi.fn();

    render(
      <DeleteResearchDialog
        workspaceId="ws-123"
        session={mockSession}
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
