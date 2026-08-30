/**
 * Hook for polling/streaming research session status and progress events.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getResearchSession } from '@/api/research';
import { ResearchSession } from '@/types';

export function useResearchStream(workspaceId?: string, sessionId?: string) {
  const [isDone, setIsDone] = useState(false);

  const query = useQuery({
    queryKey: ['researchSession', workspaceId, sessionId],
    queryFn: () => {
      if (!workspaceId || !sessionId) throw new Error('Missing IDs');
      return getResearchSession(workspaceId, sessionId);
    },
    enabled: Boolean(workspaceId && sessionId),
    refetchInterval: (queryData) => {
      const session = queryData.state.data as ResearchSession | undefined;
      if (!session) return 2000;
      if (session.status === 'completed' || session.status === 'failed') {
        return false;
      }
      return 2000;
    },
  });

  useEffect(() => {
    if (query.data) {
      if (query.data.status === 'completed' || query.data.status === 'failed') {
        setIsDone(true);
      }
    }
  }, [query.data]);

  return {
    session: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isDone,
    refetch: query.refetch,
  };
}
