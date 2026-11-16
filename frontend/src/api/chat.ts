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

/** A quote from the passage behind one cited sentence of an answer, keyed by `claimKey` of that sentence. */
export const EvidenceClaimSchema = z.object({
  key: z.string(),
  citation_index: z.number(),
  quote: z.string(),
  chunk_index: z.number().optional(),
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

/** A knowledge-graph edge the answer relied on, read as "source relationship target". */
export const AnswerRelationSchema = z.object({
  id: z.string(),
  source: z.string(),
  source_type: z.string().optional(),
  relationship: z.string(),
  target: z.string(),
  target_type: z.string().optional(),
  description: z.string().optional(),
  definition: z.string().optional(),
  note: z.string().optional(),
});
export type AnswerRelation = z.infer<typeof AnswerRelationSchema>;

/** An open end of the research: what the sources don't cover, where they disagree, or a concept to dig into. */
export const ResearchThreadSchema = z.object({
  kind: z.enum(['gap', 'tension', 'deeper']),
  text: z.string(),
  question: z.string(),
  concept: z.string().optional(),
});
export type ResearchThread = z.infer<typeof ResearchThreadSchema>;

export const AnswerExtrasSchema = z.object({
  evidence: z
    .object({
      claims: z.array(EvidenceClaimSchema),
      sources: z.record(z.string(), z.object({ quote: z.string(), chunk_index: z.number().optional() })).optional(),
    })
    .nullable()
    .optional(),
  relations: z.array(AnswerRelationSchema).optional(),
  threads: z.array(ResearchThreadSchema).optional(),
});
export type AnswerExtras = z.infer<typeof AnswerExtrasSchema>;

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
  answer_extras: AnswerExtrasSchema.nullable().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const chatApi = {
  getMessages: async (sessionId: string) => {
    const res = await apiClient.get(`/chat/sessions/${sessionId}/messages`);
    return res.data as ChatMessage[];
  },
};
