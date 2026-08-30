/**
 * Hook for workspace queries and mutations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkspace, listWorkspaces } from '@/api/workspaces';

export function useWorkspaces() {
  const queryClient = useQueryClient();

  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      createWorkspace(payload.name, payload.description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  return {
    workspaces: workspacesQuery.data || [],
    isLoading: workspacesQuery.isLoading,
    isError: workspacesQuery.isError,
    createWorkspace: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
