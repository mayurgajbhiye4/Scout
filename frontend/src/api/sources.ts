import { z } from 'zod';
import { apiClient } from './client';

export const SourceSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  source_type: z.string(),
  title: z.string(),
  canonical_uri: z.string().nullable().optional(),
  status: z.enum(['pending', 'processing', 'indexed', 'ready', 'failed', 'stale']),
  chunk_count: z.number().optional().default(0),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  last_indexed_at: z.string().nullable().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/** A source added by link. Files go through `uploadSource`. */
export const SourceCreateSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  source_type: z.string().optional(),
});
export type SourceCreateData = z.infer<typeof SourceCreateSchema>;

/** Matches the backend's MAX_UPLOAD_SIZE_MB, so an oversize file is refused before it is sent. */
export const MAX_UPLOAD_MB = 50;

/** Multipart body for the upload endpoints. The JSON default header would make axios send it as JSON. */
export function uploadRequest(file: File): [FormData, { headers: { 'Content-Type': string } }] {
  const form = new FormData();
  form.append('file', file, file.name);
  return [form, { headers: { 'Content-Type': 'multipart/form-data' } }];
}

/** The library's filter kinds, as the server names them; the same values as `SourceKind`. */
export type SourceKindParam = 'pdf' | 'youtube' | 'github' | 'web' | 'notes';

export interface SourceListParams {
  skip?: number;
  limit?: number;
  /** Matches the title or URL. */
  q?: string;
  kind?: SourceKindParam;
  /** Only these sources; at most 200. */
  ids?: string[];
}

export interface SourceCounts {
  total: number;
  by_kind: Record<SourceKindParam, number>;
}

export const sourcesApi = {
  createSource: async (data: SourceCreateData) => {
    const res = await apiClient.post('/sources/', data);
    return res.data as Source;
  },

  /** Adds a PDF, Word (.docx), text or Markdown file. The server extracts it and picks the title. */
  uploadSource: async (file: File) => {
    const res = await apiClient.post('/sources/upload', ...uploadRequest(file));
    return res.data as Source;
  },

  getSource: async (sourceId: string) => {
    const res = await apiClient.get(`/sources/${sourceId}`);
    return res.data as Source;
  },

  /** One page of the library, most recently indexed first, optionally searched, narrowed to a kind or to some ids. */
  listSources: async (params?: SourceListParams) => {
    // FastAPI reads a list as repeated keys (`ids=a&ids=b`), not axios's default `ids[]=a`
    const res = await apiClient.get('/sources/', { params, paramsSerializer: { indexes: null } });
    return res.data as Source[];
  },

  /** How many sources the library holds, in all and per kind, without fetching them. */
  getCounts: async () => {
    const res = await apiClient.get('/sources/counts');
    return res.data as SourceCounts;
  },

  deleteSource: async (sourceId: string) => {
    await apiClient.delete(`/sources/${sourceId}`);
  },
};


