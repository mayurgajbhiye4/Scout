import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { sessionsApi, type Session } from '@/api/sessions';

const SESSIONS_PAGE_SIZE = 20;

export interface SessionsList {
  sessions: Session[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

/** The signed-in user's sessions, newest first, a page at a time. Shared by the sessions rail and the ⌘K palette. */
export function useSessionsList(enabled: boolean): SessionsList {
  const query = useInfiniteQuery({
    queryKey: ['sessions'],
    queryFn: ({ pageParam = 0 }) => sessionsApi.listSessions({ skip: pageParam, limit: SESSIONS_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      !lastPage || lastPage.length < SESSIONS_PAGE_SIZE ? undefined : allPages.length * SESSIONS_PAGE_SIZE,
    enabled,
  });

  const sessions = useMemo(() => query.data?.pages.flatMap((page) => page) ?? [], [query.data]);

  return {
    sessions,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}
