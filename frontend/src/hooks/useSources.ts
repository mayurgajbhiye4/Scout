/**
 * Hook for fetching and adding workspace sources.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDocument, listDocuments, listSources } from '@/api/sources';
import { DocumentCreatePayload } from '@/types';

export function useSources(workspaceId?: string) {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['documents', workspaceId],
    queryFn: () => {
      if (!workspaceId) throw new Error('Missing workspaceId');
      return listDocuments(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });

  const sourcesQuery = useQuery({
    queryKey: ['sources', workspaceId],
    queryFn: () => {
      if (!workspaceId) throw new Error('Missing workspaceId');
      return listSources(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });

  const addSourceMutation = useMutation({
    mutationFn: (payload: DocumentCreatePayload) => {
      if (!workspaceId) throw new Error('Missing workspaceId');
      return addDocument(workspaceId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['sources', workspaceId] });
    },
  });

  return {
    documents: documentsQuery.data || [],
    sources: sourcesQuery.data || [],
    isLoading: documentsQuery.isLoading || sourcesQuery.isLoading,
    addSource: addSourceMutation.mutateAsync,
    isAdding: addSourceMutation.isPending,
  };
}
