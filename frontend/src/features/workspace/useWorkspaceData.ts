import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, type Source } from '@/api/sources';
import { sessionsApi } from '@/api/sessions';
import { knowledgeApi, type KnowledgeGraphData } from '@/api/knowledge';
import { rateLimitManager } from '@/lib/rateLimitManager';
import { normalizeSourceTitle } from '@/lib/formatters';
import { getSourceError, getSourceState, inferKindFromInput, mapToBackendSourceType, type SourceKind } from './sourceMeta';
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
  /** One-sentence summary from extraction, when there is one. */
  description?: string;
  isSource: boolean;
  /** The user's own root node, the far end of memory edges (LIKES, EXPLORED, ...) and EXTRACTED_FROM. */
  isUser: boolean;
  /** Source ids that mention this entity (or the node's own id for a source node). */
  sourceIds: string[];
  /** Knowledge edges only: memory and EXTRACTED_FROM edges don't count. */
  degree: number;
}

export interface WorkspaceLink {
  source: string;
  target: string;
  relationship: string;
  description?: string;
}

export interface WorkspaceGraph {
  nodes: WorkspaceNode[];
  links: WorkspaceLink[];
  entitiesBySource: Map<string, Set<string>>;
  /** Over knowledge edges only, like `degree`. */
  neighbors: Map<string, Set<string>>;
}

export const MEMORY_RELATIONSHIPS = new Set(['LIKES', 'DISLIKES', 'EXPLORED', 'CURIOUS_ABOUT']);

/** Edges about the user rather than the material: memory interactions and source → you. */
export function isPersonalRelationship(relationship: string) {
  return MEMORY_RELATIONSHIPS.has(relationship) || relationship === 'EXTRACTED_FROM';
}

/**
 * The universal graph already contains one `Document` node per source (its id is the source id) with
 * MENTIONS edges to every extracted entity. That is all the cross-highlighting needs, so the
 * source → entity and entity → source indexes are derived here instead of fetched separately.
 */
export function deriveWorkspaceGraph(raw: KnowledgeGraphData | undefined): WorkspaceGraph {
  const entitiesBySource = new Map<string, Set<string>>();
  const neighbors = new Map<string, Set<string>>();
  if (!raw) return { nodes: [], links: [], entitiesBySource, neighbors };

  const nodeMap = new Map<string, WorkspaceNode>();
  for (const n of raw.nodes) {
    if (!n?.id) continue;
    const type = (n.type || '').toLowerCase();
    const isSource = type === 'document';
    nodeMap.set(n.id, {
      id: n.id,
      label: n.label || n.id,
      type: n.type || 'Concept',
      description: n.description?.trim() || undefined,
      isSource,
      isUser: type === 'user',
      sourceIds: isSource ? [n.id] : [],
      degree: 0,
    });
  }

  const seen = new Set<string>();
  const links: WorkspaceLink[] = [];
  for (const e of raw.edges) {
    if (!e?.source || !e?.target || !e.relationship || e.source === e.target) continue;
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);
    if (!a || !b) continue;
    // Two different relations between the same pair are both kept
    const key = `${e.source}|${e.target}|${e.relationship}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source: e.source, target: e.target, relationship: e.relationship, description: e.description?.trim() || undefined });
    if (isPersonalRelationship(e.relationship) || a.isUser || b.isUser) continue;
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
}

export function useKnowledgeGraph(enabled: boolean) {
  const query = useQuery({
    queryKey: ['knowledge-graph', 'universal'],
    queryFn: () => knowledgeApi.getKnowledgeGraph('universal'),
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const graph = useMemo(() => deriveWorkspaceGraph(query.data), [query.data]);

  return { graph, isLoading: query.isLoading, isError: query.isError, isFetching: query.isFetching, refetch: query.refetch };
}

// While a rebuild runs server-side the map refetches on this beat, for about as long as the sources should take
const REBUILD_POLL_MS = 8000;
const REBUILD_MS_PER_SOURCE = 8000;
const REBUILD_MAX_MS = 5 * 60 * 1000;

/** Re-extracts typed, described relations for every source, then keeps the map fresh while that runs. */
export function useRebuildRelations() {
  const queryClient = useQueryClient();
  const [pollUntil, setPollUntil] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: knowledgeApi.reextractGraph,
    onSuccess: ({ queued, already_running }) => {
      if (queued > 0 || already_running) {
        setPollUntil(Date.now() + Math.min(REBUILD_MAX_MS, Math.max(queued, 1) * REBUILD_MS_PER_SOURCE + 2 * REBUILD_POLL_MS));
      }
    },
    onError: (err) => {
      if (getHttpStatus(err) === 429) rateLimitManager.notify(err);
    },
  });

  useEffect(() => {
    if (pollUntil === null) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-graph'] });
      if (Date.now() >= pollUntil) {
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
        setPollUntil(null);
      }
    }, REBUILD_POLL_MS);
    return () => clearInterval(id);
  }, [pollUntil, queryClient]);

  return {
    rebuild: mutation.mutate,
    isRebuilding: mutation.isPending || pollUntil !== null,
    /** Set when the request itself failed, e.g. the hourly rebuild limit. */
    error: mutation.isError ? (getHttpStatus(mutation.error) === 429 ? 'Rebuilt recently. Try again in a while.' : 'Rebuild failed. Try again.') : null,
  };
}

// ── Ingestion ──────────────────────────────────────────────────────────────

interface PendingSourceBase {
  tempId: string;
  kind: SourceKind;
  title: string;
  input: string;
  content?: string;
}

/** An optimistic row: ingesting → ready (then removed) | failed → ingesting again on retry. */
export type PendingSource = PendingSourceBase &
  (
    | {
        status: 'ingesting';
        /** The request reads and indexes in one go, so the switch to 'indexing' is timed, not reported. */
        phase: 'reading' | 'indexing';
        /** Which try this is, so a timer left over from an earlier one can't touch it. */
        attempt?: number;
      }
    | { status: 'ready'; chunkCount: number }
    | { status: 'failed'; error: string }
  );

function ingestBase({ tempId, kind, title, input, content }: PendingSource): PendingSourceBase {
  return { tempId, kind, title, input, content };
}

/** How each ingest phase reads in the UI. */
export const INGEST_PHASE_COPY = {
  reading: 'Reading',
  indexing: 'Indexing passages',
} as const;

// When an ingesting source is shown as indexing, and how long a finished one stays listed
const READING_MS = 1400;
const READY_LINGER_MS = 6000;

function describeIngestError(err: unknown): string {
  if (getHttpStatus(err) === 429) return 'Ingest limit reached (10 sources per minute). Try again shortly.';
  return getServerErrorMessage(err) || (err instanceof Error && err.message) || 'Ingestion failed';
}

/**
 * Adds sources to the library and to the active session, so the copilot grounds on them immediately. With no
 * session open, `ensureSession` starts one (named after the source) and the source joins it. Without
 * `ensureSession` the source only joins the library. Optimistic rows live here until the request settles.
 */
export function useSourceIngest(sessionId: string | null, ensureSession?: (title: string) => Promise<string>) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingSource[]>([]);

  const run = useCallback(
    async (item: PendingSource & { status: 'ingesting' }) => {
      setTimeout(() => {
        setPending((prev) =>
          prev.map((p) =>
            p.tempId === item.tempId && p.status === 'ingesting' && p.attempt === item.attempt ? { ...p, phase: 'indexing' } : p
          )
        );
      }, READING_MS);
      try {
        const payload = {
          url: /^https?:\/\//i.test(item.input) ? item.input : undefined,
          title: item.title,
          content: item.content,
          source_type: mapToBackendSourceType(item.kind, item.input),
        };
        const targetId = sessionId ?? (ensureSession ? await ensureSession(item.title) : null);
        const created: Source = targetId
          ? await sessionsApi.attachSource(targetId, payload)
          : await sourcesApi.createSource(payload);

        if (created?.status === 'failed') {
          throw new Error(getSourceError(created) || 'Ingestion failed');
        }
        if (getSourceState(created) === 'ingesting') {
          // Another request is already ingesting this URL; the library row tracks that one, so this row can go
          setPending((prev) => prev.filter((p) => p.tempId !== item.tempId));
        } else {
          const chunkCount = created.chunk_count || Number(created.metadata?.chunk_count) || 1;
          setPending((prev) =>
            prev.map((p) =>
              p.tempId === item.tempId ? { ...ingestBase(p), status: 'ready', chunkCount, title: created.title || p.title } : p
            )
          );
          setTimeout(() => setPending((prev) => prev.filter((p) => !(p.tempId === item.tempId && p.status === 'ready'))), READY_LINGER_MS);
        }
        queryClient.invalidateQueries({ queryKey: ['sources'] });
        queryClient.invalidateQueries({ queryKey: ['knowledge-graph'] });
        queryClient.invalidateQueries({ queryKey: ['curiosity'] });
        if (targetId) queryClient.invalidateQueries({ queryKey: ['session-sources', targetId] });
      } catch (err) {
        if (getHttpStatus(err) === 429) rateLimitManager.notify(err);
        setPending((prev) =>
          prev.map((p) => (p.tempId === item.tempId ? { ...ingestBase(p), status: 'failed', error: describeIngestError(err) } : p))
        );
      }
    },
    [ensureSession, queryClient, sessionId]
  );

  const ingest = useCallback(
    (fallbackKind: SourceKind, input: string, content?: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      const item: PendingSource & { status: 'ingesting' } = {
        tempId: Math.random().toString(36).slice(2, 10),
        kind: inferKindFromInput(trimmed, fallbackKind),
        title: normalizeSourceTitle(trimmed, trimmed),
        input: trimmed,
        content,
        status: 'ingesting',
        phase: 'reading',
        attempt: 1,
      };
      setPending((prev) => [item, ...prev]);
      run(item);
    },
    [run]
  );

  const retry = useCallback(
    (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (item?.status !== 'failed') return;
      const next: PendingSource & { status: 'ingesting' } = {
        ...ingestBase(item),
        status: 'ingesting',
        phase: 'reading',
        attempt: Date.now(),
      };
      setPending((prev) => prev.map((p) => (p.tempId === tempId ? next : p)));
      run(next);
    },
    [pending, run]
  );

  const dismiss = useCallback((tempId: string) => {
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

