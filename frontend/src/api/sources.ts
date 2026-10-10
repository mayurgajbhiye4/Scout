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
  metadata: z.record(z.any()).optional(),
  created_at: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const SourceCreateSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  source_type: z.string().optional(),
});
export type SourceCreateData = z.infer<typeof SourceCreateSchema>;

export const sourcesApi = {
  createSource: async (data: SourceCreateData) => {
    const res = await apiClient.post('/sources/', data);
    return res.data as Source;
  },

  getSource: async (sourceId: string) => {
    const res = await apiClient.get(`/sources/${sourceId}`);
    return res.data as Source;
  },

  listSources: async () => {
    const res = await apiClient.get('/sources/');
    return res.data as Source[];
  },

  deleteSource: async (sourceId: string) => {
    await apiClient.delete(`/sources/${sourceId}`);
  },
};


