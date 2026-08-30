/**
 * Document and Source TypeScript types.
 */

export type SourceType = 'pdf' | 'url' | 'youtube' | 'github' | 'notion' | 'text' | 'docx';

export type IngestionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DocumentItem {
  id: string;
  workspace_id: string;
  filename: string;
  source_type: SourceType;
  status: IngestionStatus;
  url?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SourceItem {
  id: string;
  workspace_id: string;
  type: SourceType;
  title: string;
  url?: string | null;
  content_preview?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface DocumentCreatePayload {
  source_type: SourceType;
  filename: string;
  url?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}
