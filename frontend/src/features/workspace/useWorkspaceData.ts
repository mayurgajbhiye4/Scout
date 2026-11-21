import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { MAX_UPLOAD_MB, sourcesApi, type Source } from '@/api/sources';
import { sessionsApi } from '@/api/sessions';
import { knowledgeApi, type KnowledgeGraphData } from '@/api/knowledge';
import { rateLimitManager } from '@/lib/rateLimitManager';
import { normalizeSourceTitle } from '@/lib/formatters';
import { getSourceError, getSourceState, inferKindFromInput, mapToBackendSourceType, type SourceKind } from './sourceMeta';
import { getHttpStatus, getServerErrorMessage } from '@/lib/apiError';

const SOURCES_PAGE_SIZE = 20;
const NO_SOURCES: Source[] = [];
// The most ids the list endpoint takes in one request
const MAX_IDS_PER_REQUEST = 100;

function nextOffset(pageSize: number) {
  return (lastPage: unknown[] | undefined, allPages: unknown[][]) =>
    !lastPage || lastPage.length < pageSize ? undefined : allPages.length * pageSize;
}

export interface LibraryFilter {
  /** Matched against title and URL on the server. */
  query?: string;
  kind?: SourceKind;
  /** Only these sources, e.g. the ones that mention a concept. */
  ids?: string[];
}

/** A list that loads a page at a time as it's scrolled. */
export interface PagedSources {
  sources: Source[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

interface InfiniteSourcesQuery {
  data?: { pages: Source[][] };
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

function usePagedSources(query: InfiniteSourcesQuery, enabled: boolean): PagedSources {
  const { data } = query;
  const sources = useMemo(() => data?.pages.flat() ?? [], [data]);
  return {
    sources,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}

/** Polls while anything listed is still being read, so it settles without a reload. */
function pollWhileIngesting(q: { state: { data?: { pages: Source[][] } } }) {
  const busy = q.state.data?.pages.some((page) => page.some((s) => getSourceState(s) === 'ingesting'));
  return busy ? 5000 : false;
}

/**
 * The user's source library, a page at a time, searched and filtered on the server. Nothing beyond the first page
 * is fetched until `fetchNextPage` asks for it (the list calls it as it's scrolled to the end).
 */
export function useSourcesLibrary(enabled: boolean, filter: LibraryFilter = {}): PagedSources {
  const q = filter.query?.trim() || undefined;
  const ids = filter.ids ? [...filter.ids].sort() : undefined;
  const isEnabled = enabled && (ids === undefined || ids.length > 0);
  const query = useInfiniteQuery({
    queryKey: ['sources', 'list', { q, kind: filter.kind, ids }] as const,
    queryFn: ({ pageParam }) =>
      sourcesApi.listSources({ skip: pageParam, limit: SOURCES_PAGE_SIZE, q, kind: filter.kind, ids }),
    initialPageParam: 0,
    getNextPageParam: nextOffset(SOURCES_PAGE_SIZE),
    enabled: isEnabled,
    // A new search keeps the old results showing until its own arrive, instead of flashing the skeleton
    placeholderData: keepPreviousData,
    refetchInterval: pollWhileIngesting,
  });
  const paged = usePagedSources(query, isEnabled);
  // Narrowed to no ids at all: an empty list, not a request
  return ids?.length === 0 ? { ...paged, sources: NO_SOURCES, isLoading: false, hasNextPage: false } : paged;
}

/** The library's size, in all and per kind, for the heading and the filter chips. */
export function useSourceCounts(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['sources', 'counts'],
    queryFn: sourcesApi.getCounts,
    enabled,
  });
  return data;
}

/** The open session's sources, newest first, a page at a time. */
export function useSessionSources(sessionId: string | null): PagedSources {
  const enabled = Boolean(sessionId);
  const query = useInfiniteQuery({
    queryKey: ['session-sources', sessionId, 'pages'] as const,
    queryFn: ({ pageParam }) => sessionsApi.getSessionSources(sessionId!, { skip: pageParam, limit: SOURCES_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: nextOffset(SOURCES_PAGE_SIZE),
    enabled,
  });
  return usePagedSources(query, enabled);
}

/** Every source id in the open session: one light request, so the map's scope and the count are whole. */
export function useSessionSourceIds(sessionId: string | null) {
  const { data } = useQuery({
    queryKey: ['session-sources', sessionId, 'ids'],
    queryFn: () => sessionsApi.getSessionSourceIds(sessionId!),
    enabled: Boolean(sessionId),
  });
  return useMemo(() => new Set<string>(Array.isArray(data) ? data : []), [data]);
}

/** A cached source list without one source: pages of sources (infinite or not), or a list of ids. */
export function withoutSource(data: unknown, sourceId: string): unknown {
  const keep = (item: unknown) => (typeof item === 'string' ? item : (item as Source | undefined)?.id) !== sourceId;
  if (Array.isArray(data)) return data.filter(keep);
  const paged = data as { pages?: unknown[] } | undefined;
  if (paged?.pages) return { ...paged, pages: paged.pages.map((page) => (Array.isArray(page) ? page.filter(keep) : page)) };
  return data;
}

function isSource(value: unknown): value is Source {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'source_type' in value);
}

/** Every source held in the query cache, from any page of any list. */
function sourcesInCache(queryClient: QueryClient): Map<string, Source> {
  const found = new Map<string, Source>();
  const add = (value: unknown) => {
    if (isSource(value) && !found.has(value.id)) found.set(value.id, value);
  };
  for (const key of [['sources'], ['session-sources']]) {
    for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: key })) {
      const pages = (data as { pages?: unknown[] } | undefined)?.pages;
      for (const chunk of pages ?? [data]) {
        if (Array.isArray(chunk)) chunk.forEach(add);
        else add(chunk);
      }
    }
  }
  return found;
}

/**
 * Looks sources up by id without loading the whole library: every source some list has already fetched, plus the
 * `needed` ones (a selection, a citation, a concept's sources) fetched by id when no list has them yet.
 * `isResolving(id)` is true while a needed id is still on its way, so a selection isn't dropped before it arrives.
 */
export function useSourceLookup(enabled: boolean, needed: Iterable<string>) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const head = event.query.queryKey[0];
        if (event.type === 'updated' && (head === 'sources' || head === 'session-sources')) setVersion((v) => v + 1);
      }),
    [queryClient]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is how the cache says it changed
  const known = useMemo(() => sourcesInCache(queryClient), [queryClient, version]);

  const neededKey = [...new Set(needed)].sort().join(',');
  const missing = useMemo(
    () => (neededKey ? neededKey.split(',').filter((id) => !known.has(id)).slice(0, MAX_IDS_PER_REQUEST) : []),
    [known, neededKey]
  );
  const byId = useQuery({
    queryKey: ['sources', 'by-id', missing],
    queryFn: () => sourcesApi.listSources({ ids: missing, limit: MAX_IDS_PER_REQUEST }),
    enabled: enabled && missing.length > 0,
    staleTime: 60 * 1000,
  });

  const resolving = byId.isFetching || (enabled && missing.length > 0 && byId.isPending);
  return {
    sourcesById: known,
    isResolving: useCallback((id: string) => !known.has(id) && resolving && missing.includes(id), [known, missing, resolving]),
  };
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
  /** A link, or for a file its name. */
  input: string;
  /** A PDF, Word, text or Markdown file to upload; kept so a failed upload can be retried. */
  file?: File;
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

function ingestBase({ tempId, kind, title, input, file }: PendingSource): PendingSourceBase {
  return { tempId, kind, title, input, file };
}

/** How each ingest phase reads in the UI. */
export const INGEST_PHASE_COPY = {
  reading: 'Reading',
  indexing: 'Indexing passages',
} as const;

// When an ingesting source is shown as indexing, and how long a finished one stays listed
const READING_MS = 1400;
const READY_LINGER_MS = 6000;

/** Creates the source: uploads its file, or sends its link. With a session id, it joins that session. */
async function sendSource(item: PendingSourceBase, sessionId: string | null): Promise<Source> {
  if (item.file) {
    // The server reads the file and picks the title from it
    return sessionId ? sessionsApi.uploadSource(sessionId, item.file) : sourcesApi.uploadSource(item.file);
  }
  const payload = {
    url: item.input,
    title: item.title,
    source_type: mapToBackendSourceType(item.kind, item.input),
  };
  return sessionId ? sessionsApi.attachSource(sessionId, payload) : sourcesApi.createSource(payload);
}

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
        if (item.file && item.file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          throw new Error(`${item.file.name} is larger than the ${MAX_UPLOAD_MB} MB limit.`);
        }
        const targetId = sessionId ?? (ensureSession ? await ensureSession(item.title) : null);
        const created = await sendSource(item, targetId);

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
    (fallbackKind: SourceKind, input: string, file?: File) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      const item: PendingSource & { status: 'ingesting' } = {
        tempId: Math.random().toString(36).slice(2, 10),
        kind: inferKindFromInput(trimmed, fallbackKind),
        title: normalizeSourceTitle(trimmed, trimmed),
        input: trimmed,
        file,
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

