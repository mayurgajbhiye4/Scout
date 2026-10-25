import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, type Source } from '@/api/sources';
import { sessionsApi } from '@/api/sessions';
import { knowledgeApi } from '@/api/knowledge';
import { soundEffects } from '@/lib/soundEffects';
import { rateLimitManager } from '@/lib/rateLimitManager';
import { normalizeSourceTitle } from '@/lib/formatters';
import { getSourceState, inferKindFromInput, mapToBackendSourceType, type SourceKind } from './sourceMeta';
import { getHttpStatus, getServerErrorMessage } from '@/lib/apiError';

const SOURCES_PAGE_SIZE = 20;
const MAX_SOURCE_PAGES = 10;

/**
 * The user's whole source library. Shares the ['sources'] infinite-query cache with the rest of the
 * app, eagerly pulls every page (up to 200 sources) so filter counts are honest, and polls while
 * anything is still ingesting.
 */
export function useSourcesLibrary(enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: ['sources'],
    queryFn: ({ pageParam = 0 }) => sourcesApi.listSources({ skip: pageParam, limit: SOURCES_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < SOURCES_PAGE_SIZE) return undefined;
      return allPages.length * SOURCES_PAGE_SIZE;
    },
    enabled,
    refetchInterval: (q) => {
      const pages = q.state.data?.pages ?? [];
      const busy = pages.some((page) => page.some((s) => getSourceState(s) === 'ingesting'));
      return busy ? 5000 : false;
    },
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage, data } = query;
  const pageCount = data?.pages.length ?? 0;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pageCount < MAX_SOURCE_PAGES) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, pageCount]);

  const sources = useMemo(() => data?.pages.flat() ?? [], [data]);
  return { sources, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

export function useSessionSourceIds(sessionId: string | null) {
  const { data } = useQuery({
    queryKey: ['session-sources', sessionId],
    queryFn: () => sessionsApi.getSessionSources(sessionId!),
    enabled: Boolean(sessionId),
  });
  return useMemo(() => new Set<string>((Array.isArray(data) ? data : []).map((s: Source) => s.id)), [data]);
}

// ── Knowledge graph ────────────────────────────────────────────────────────

export interface WorkspaceNode {
  id: string;
  label: string;
  type: string;
  isSource: boolean;
  /** Source ids that mention this entity (or the node's own id for a source node). */
  sourceIds: string[];
  degree: number;
}

export interface WorkspaceLink {
  source: string;
  target: string;
  relationship: string;
}

export interface WorkspaceGraph {
  nodes: WorkspaceNode[];
  links: WorkspaceLink[];
  entitiesBySource: Map<string, Set<string>>;
  neighbors: Map<string, Set<string>>;
}

const HIDDEN_TYPES = new Set(['user']);
const MEMORY_RELATIONSHIPS = new Set(['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']);

/**
 * The universal graph already contains one `Document` node per source (its id is the source id) with
 * MENTIONS edges to every extracted entity. That is all the cross-highlighting needs, so the
 * source → entity and entity → source indexes are derived here instead of fetched separately.
 */
export function useKnowledgeGraph(enabled: boolean) {
  const query = useQuery({
    queryKey: ['knowledge-graph', 'universal'],
    queryFn: () => knowledgeApi.getKnowledgeGraph('universal'),
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const graph = useMemo<WorkspaceGraph>(() => {
    const raw = query.data;
    const entitiesBySource = new Map<string, Set<string>>();
    const neighbors = new Map<string, Set<string>>();
    if (!raw) return { nodes: [], links: [], entitiesBySource, neighbors };

    const nodeMap = new Map<string, WorkspaceNode>();
    for (const n of raw.nodes) {
      if (!n?.id || HIDDEN_TYPES.has((n.type || '').toLowerCase())) continue;
      const isSource = (n.type || '').toLowerCase() === 'document';
      nodeMap.set(n.id, {
        id: n.id,
        label: n.label || n.id,
        type: n.type || 'Concept',
        isSource,
        sourceIds: isSource ? [n.id] : [],
        degree: 0,
      });
    }

    const seen = new Set<string>();
    const links: WorkspaceLink[] = [];
    for (const e of raw.edges) {
      if (!e?.source || !e?.target || e.source === e.target) continue;
      if (MEMORY_RELATIONSHIPS.has(e.relationship)) continue;
      const a = nodeMap.get(e.source);
      const b = nodeMap.get(e.target);
      if (!a || !b) continue;
      const key = `${e.source}|${e.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: e.source, target: e.target, relationship: e.relationship });
      a.degree += 1;
      b.degree += 1;
      if (!neighbors.has(a.id)) neighbors.set(a.id, new Set());
      if (!neighbors.has(b.id)) neighbors.set(b.id, new Set());
      neighbors.get(a.id)!.add(b.id);
      neighbors.get(b.id)!.add(a.id);
      if (a.isSource && !b.isSource) {
        b.sourceIds.push(a.id);
        if (!entitiesBySource.has(a.id)) entitiesBySource.set(a.id, new Set());
        entitiesBySource.get(a.id)!.add(b.id);
      }
    }

    return { nodes: Array.from(nodeMap.values()), links, entitiesBySource, neighbors };
  }, [query.data]);

  return { graph, isLoading: query.isLoading, isError: query.isError, isFetching: query.isFetching, refetch: query.refetch };
}

// ── Ingestion ──────────────────────────────────────────────────────────────

export interface PendingSource {
  tempId: string;
  kind: SourceKind;
  title: string;
  input: string;
  content?: string;
  status: 'ingesting' | 'failed';
  error?: string;
}

function describeIngestError(err: unknown): string {
  if (getHttpStatus(err) === 429) return 'Ingest limit reached (10 sources per minute). Try again shortly.';
  return getServerErrorMessage(err) || (err instanceof Error && err.message) || 'Ingestion failed';
}

/**
 * Adds sources to the library — and to the active session when there is one, so the copilot grounds
 * on them immediately. Optimistic rows live here until the request settles.
 */
export function useSourceIngest(sessionId: string | null) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingSource[]>([]);

  const run = useCallback(
    async (item: PendingSource) => {
      try {
        const payload = {
          url: /^https?:\/\//i.test(item.input) ? item.input : undefined,
          title: item.title,
          content: item.content,
          source_type: mapToBackendSourceType(item.kind, item.input),
        };
        const created: Source = sessionId
          ? await sessionsApi.attachSource(sessionId, payload)
          : await sourcesApi.createSource(payload);

        if (created?.status === 'failed') {
          throw new Error((created.metadata?.error as string) || 'Extraction or embedding failed');
        }
        soundEffects.playEmbeddingComplete();
        setPending((prev) => prev.filter((p) => p.tempId !== item.tempId));
        queryClient.invalidateQueries({ queryKey: ['sources'] });
        queryClient.invalidateQueries({ queryKey: ['knowledge-graph'] });
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
        if (sessionId) queryClient.invalidateQueries({ queryKey: ['session-sources', sessionId] });
      } catch (err) {
        if (getHttpStatus(err) === 429) rateLimitManager.notify(err);
        setPending((prev) =>
          prev.map((p) => (p.tempId === item.tempId ? { ...p, status: 'failed', error: describeIngestError(err) } : p))
        );
      }
    },
    [queryClient, sessionId]
  );

  const ingest = useCallback(
    (fallbackKind: SourceKind, input: string, content?: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      soundEffects.playSourceDrop();
      const item: PendingSource = {
        tempId: Math.random().toString(36).slice(2, 10),
        kind: inferKindFromInput(trimmed, fallbackKind),
        title: normalizeSourceTitle(trimmed, trimmed),
        input: trimmed,
        content,
        status: 'ingesting',
      };
      setPending((prev) => [item, ...prev]);
      run(item);
    },
    [run]
  );

  const retry = useCallback(
    (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (!item) return;
      const next = { ...item, status: 'ingesting' as const, error: undefined };
      setPending((prev) => prev.map((p) => (p.tempId === tempId ? next : p)));
      run(next);
    },
    [pending, run]
  );

  const dismiss = useCallback((tempId: string) => {
    soundEffects.playChipRemove();
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }, []);

  return { pending, ingest, retry, dismiss };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

