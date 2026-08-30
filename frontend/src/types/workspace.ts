/**
 * Workspace TypeScript types.
 */

export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceCreatePayload {
  name: string;
  description?: string;
}
