import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '@/api/knowledge';

// Until the knowledge map has enough in it to suggest questions of its own
const STARTER_QUESTIONS = [
  'Synthesize recent breakthroughs in Graph RAG',
  'Compare dense retrieval vs hybrid search',
  'Analyze multi-agent reasoning workflows',
];

/** Questions to start a conversation with: drawn from the knowledge map when it has some, with a way to ask for new ones. */
export function useStarterQuestions(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['curiosity'],
    queryFn: () => knowledgeApi.getCuriosity(),
    enabled,
    staleTime: 45 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const refresh = useMutation({
    mutationFn: () => knowledgeApi.getCuriosity(true),
    onSuccess: (fresh) => queryClient.setQueryData(['curiosity'], fresh),
    onError: () => query.refetch(),
  });

  const fromMap = query.data?.suggested_prompts ?? [];
  return {
    questions: fromMap.length > 0 ? fromMap : STARTER_QUESTIONS,
    fromMap: fromMap.length > 0,
    isLoading: query.isFetching || refresh.isPending,
    refresh: () => refresh.mutate(),
  };
}
