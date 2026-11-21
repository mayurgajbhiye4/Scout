import { z } from 'zod';
import { apiClient } from './client';
import { uploadRequest, type Source, type SourceCreateData } from './sources';

export const SessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'active', 'archived']),
  source_policy: z.enum(['source_first', 'source_only', 'web_only', 'mixed']),
  session_summary: z.string().nullable().optional(),
  last_activity_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  /** How many sources the session holds; the sources themselves page in from `getSessionSources`. */
  source_count: z.number().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionCreateSchema = z.object({
  title: z.string().optional(),
  source_policy: z.enum(['source_first', 'source_only', 'web_only', 'mixed']).default('source_first'),
  source_ids: z.array(z.string()).optional(),
});
export type SessionCreateData = z.infer<typeof SessionCreateSchema>;

export const sessionsApi = {
  createSession: async (data: SessionCreateData) => {
    const res = await apiClient.post('/sessions/', data);
    return res.data as Session;
  },

  listSessions: async (params?: { skip?: number; limit?: number }) => {
    const res = await apiClient.get('/sessions/', { params });
    return res.data as Session[];
  },

  getSession: async (sessionId: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}`);
    return res.data as Session;
  },

  deleteSession: async (sessionId: string) => {
    await apiClient.delete(`/sessions/${sessionId}`);
  },

  updateSession: async (sessionId: string, data: { title?: string; session_summary?: string; status?: string }) => {
    const res = await apiClient.patch(`/sessions/${sessionId}`, data);
    return res.data as Session;
  },

  /** One page of the session's sources, most recently added first. */
  getSessionSources: async (sessionId: string, params?: { skip?: number; limit?: number }) => {
    const res = await apiClient.get(`/sessions/${sessionId}/sources`, { params });
    return res.data as Source[];
  },

  /** Every source id in the session, without the sources: what the map's scope and the count need. */
  getSessionSourceIds: async (sessionId: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}/source-ids`);
    return res.data as string[];
  },

  attachSource: async (sessionId: string, data: SourceCreateData) => {
    const res = await apiClient.post(`/sessions/${sessionId}/sources`, data);
    return res.data;
  },

  /** Uploads a PDF, Word (.docx), text or Markdown file and attaches the new source to the session. */
  uploadSource: async (sessionId: string, file: File) => {
    const res = await apiClient.post(`/sessions/${sessionId}/sources/upload`, ...uploadRequest(file));
    return res.data as Source;
  },

  detachSource: async (sessionId: string, sourceId: string) => {
    await apiClient.delete(`/sessions/${sessionId}/sources/${sourceId}`);
  },
};

