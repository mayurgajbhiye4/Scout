import { z } from 'zod';
import { apiClient } from './client';

export const SourceSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  type: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  external_id: z.string().nullable(),
  metadata_: z.record(z.any()).nullable(),
  created_at: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  filename: z.string(),
  mime_type: z.string(),
  source_type: z.string(),
  status: z.string(),
  metadata_: z.record(z.any()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const DocumentCreateSchema = z.object({
  source_type: z.string(),
  url: z.string().url().optional().or(z.literal('')),
  filename: z.string().optional(),
});
export type DocumentCreateData = z.infer<typeof DocumentCreateSchema>;

export const sourcesApi = {
  listSources: async (workspaceId: string) => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/sources`);
    return res.data.data as Source[];
  },

  listDocuments: async (workspaceId: string) => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/documents`);
    return res.data.data as Document[];
  },

  createDocument: async (workspaceId: string, data: DocumentCreateData) => {
    const res = await apiClient.post(`/workspaces/${workspaceId}/documents`, data);
    return res.data.data as Document;
  },

  uploadDocument: async (workspaceId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(`/workspaces/${workspaceId}/documents/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data.data as Document;
  },

  deleteDocument: async (workspaceId: string, documentId: string) => {
    await apiClient.delete(`/workspaces/${workspaceId}/documents/${documentId}`);
  },

  deleteSource: async (workspaceId: string, sourceId: string) => {
    await apiClient.delete(`/workspaces/${workspaceId}/sources/${sourceId}`);
  },
};
