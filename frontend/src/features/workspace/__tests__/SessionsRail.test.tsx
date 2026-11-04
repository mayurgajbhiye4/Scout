import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@/api/sessions';
import SessionsRail from '../SessionsRail';
import type { SessionsList } from '../useSessionsList';

const session = (id: string, title: string, summary = ''): Session => ({
  id,
  user_id: 'u1',
  title,
  status: 'active',
  source_policy: 'source_first',
  session_summary: summary,
  last_activity_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  sources: [],
});

function list(sessions: Session[], overrides: Partial<SessionsList> = {}): SessionsList {
  return {
    sessions,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function renderRail(props: Partial<React.ComponentProps<typeof SessionsRail>> = {}) {
  const onOpen = vi.fn();
  const onNew = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionsRail
        list={list([session('a', 'Graph RAG survey', 'retrieval'), session('b', 'Transformer notes')])}
        activeId="b"
        onOpen={onOpen}
        onNew={onNew}
        onDeleted={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onOpen, onNew };
}

describe('SessionsRail', () => {
  it('lists sessions, marks the open one, and opens a session on click', () => {
    const { onOpen } = renderRail();
    expect(screen.getByRole('button', { name: 'Transformer notes' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Graph RAG survey' }));
    expect(onOpen).toHaveBeenCalledWith({ id: 'a', title: 'Graph RAG survey' });
  });

  it('filters by title or summary', () => {
    renderRail();
    fireEvent.change(screen.getByLabelText(/filter sessions/i), { target: { value: 'retrieval' } });
    expect(screen.getByRole('button', { name: 'Graph RAG survey' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transformer notes' })).not.toBeInTheDocument();
  });

  it('starts new research, and says how to begin when there are no sessions', () => {
    const { onNew } = renderRail({ list: list([]) });
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
