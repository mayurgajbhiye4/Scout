import { z } from 'zod';
import { apiClient } from './client';

export const WorkspaceSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  source_count: z.number().default(0),
  research_count: z.number().default(0),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceListSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  source_count: z.number().default(0),
  research_count: z.number().default(0),
});
export type WorkspaceListItem = z.infer<typeof WorkspaceListSchema>;

export const WorkspaceCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
});
export type WorkspaceCreateData = z.infer<typeof WorkspaceCreateSchema>;

export const workspacesApi = {
  list: async () => {
    const res = await apiClient.get('/workspaces');
    return res.data.data as WorkspaceListItem[];
  },
  
  get: async (id: string) => {
    const res = await apiClient.get(`/workspaces/${id}`);
    return res.data.data as Workspace;
  },
  
  create: async (data: WorkspaceCreateData) => {
    const res = await apiClient.post('/workspaces', data);
    return res.data.data as Workspace;
  },
  
  delete: async (id: string) => {
    await apiClient.delete(`/workspaces/${id}`);
  }
};
