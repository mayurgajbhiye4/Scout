import { z } from 'zod';
import { apiClient } from './client';

export const CitationSchema = z.object({
  id: z.string().optional(),
  citation_index: z.number(),
  // Null for web results and knowledge-graph evidence
  source_id: z.string().nullable().optional(),
  locator: z.any().optional(),
  source_title: z.string().optional(),
  snippet: z.string().optional(),
});

/** How an answer's evidence was found: every search run, rewritten-query retries, and the last evidence verdict. */
export const ResearchTraceSchema = z.object({
  searches: z.array(
    z.object({
      source: z.string(), // 'library' (RAG + knowledge graph) | 'web'
      query: z.string(),
      found: z.number().optional(),
    })
  ),
  retries: z.number().optional(),
  verdict: z.object({ sufficient: z.boolean(), reason: z.string().optional() }).nullable().optional(),
});
export type ResearchTrace = z.infer<typeof ResearchTraceSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  status: z.string(),
  created_at: z.string(),
  citations: z.array(CitationSchema).optional(),
  // Follow-up questions built from the knowledge graph and retrieved sources
  suggested_questions: z.array(z.string()).nullable().optional(),
  research_trace: ResearchTraceSchema.nullable().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const chatApi = {
  getMessages: async (sessionId: string) => {
    const res = await apiClient.get(`/chat/sessions/${sessionId}/messages`);
    return res.data as ChatMessage[];
  },
};
