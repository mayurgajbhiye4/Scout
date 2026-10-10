import { z } from 'zod';
import { apiClient } from './client';

export const SessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'active', 'archived']),
  mode: z.enum(['ask', 'research', 'search', 'deep_research']),
  source_policy: z.enum(['source_first', 'source_only', 'web_only', 'mixed']),
  session_summary: z.string().nullable().optional(),
  last_activity_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionCreateSchema = z.object({
  title: z.string().optional(),
  mode: z.enum(['ask', 'research', 'search', 'deep_research']).default('ask'),
  source_policy: z.enum(['source_first', 'source_only', 'web_only', 'mixed']).default('source_first'),
  source_ids: z.array(z.string()).optional(),
});
export type SessionCreateData = z.infer<typeof SessionCreateSchema>;

export const sessionsApi = {
  createSession: async (data: SessionCreateData) => {
    const res = await apiClient.post('/sessions/', data);
    return res.data as Session;
  },

  listSessions: async () => {
    const res = await apiClient.get('/sessions/');
    return res.data as Session[];
  },

  getSession: async (sessionId: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}`);
    return res.data as Session;
  },

  deleteSession: async (sessionId: string) => {
    await apiClient.delete(`/sessions/${sessionId}`);
  },

  getSessionSources: async (sessionId: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}/sources`);
    return res.data;
  },

  attachSource: async (sessionId: string, data: { url?: string; title?: string; source_type?: string; content?: string }) => {
    const res = await apiClient.post(`/sessions/${sessionId}/sources`, data);
    return res.data;
  },

  detachSource: async (sessionId: string, sourceId: string) => {
    await apiClient.delete(`/sessions/${sessionId}/sources/${sourceId}`);
  },
};

