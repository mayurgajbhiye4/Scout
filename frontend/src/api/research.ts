import { z } from 'zod';
import { apiClient } from './client';

export const ResearchSessionSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  question: z.string(),
  status: z.string(),
  research_depth: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ResearchSession = z.infer<typeof ResearchSessionSchema>;

export const ResearchCreateSchema = z.object({
  question: z.string().min(5, "Question must be at least 5 characters"),
  research_depth: z.enum(['quick', 'standard', 'deep']).default('standard'),
});
export type ResearchCreateData = z.infer<typeof ResearchCreateSchema>;

export const EvidenceSchema = z.object({
  id: z.string(),
  claim: z.string(),
  supporting_excerpt: z.string(),
  confidence: z.number(),
  source_id: z.string().nullable(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  content_markdown: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

export const researchApi = {
  createSession: async (workspaceId: string, data: ResearchCreateData) => {
    const res = await apiClient.post(`/workspaces/${workspaceId}/research`, data);
    return res.data.data as ResearchSession;
  },

  listSessions: async (workspaceId: string) => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/research`);
    return res.data.data as ResearchSession[];
  },

  getSession: async (workspaceId: string, sessionId: string) => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/research/${sessionId}`);
    return res.data.data as ResearchSession;
  },

  getReport: async (workspaceId: string, sessionId: string) => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/research/${sessionId}/report`);
    return res.data.data as Report;
  },

  getEvidence: async (workspaceId: string, sessionId: string) => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/research/${sessionId}/evidence`);
    return res.data.data as Evidence[];
  },

  deleteSession: async (workspaceId: string, sessionId: string) => {
    await apiClient.delete(`/workspaces/${workspaceId}/research/${sessionId}`);
  },
};
