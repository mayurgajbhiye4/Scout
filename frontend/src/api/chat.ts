import { z } from 'zod';
import { apiClient } from './client';

export const CitationSchema = z.object({
  id: z.string(),
  citation_index: z.number(),
  source_id: z.string(),
  locator: z.any(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  status: z.string(),
  created_at: z.string(),
  citations: z.array(CitationSchema).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const chatApi = {
  getMessages: async (sessionId: string) => {
    const res = await apiClient.get(`/chat/sessions/${sessionId}/messages`);
    return res.data as ChatMessage[];
  },
};
