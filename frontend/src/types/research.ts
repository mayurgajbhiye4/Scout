/**
 * Research Session, Task, Evidence, and Report TypeScript types.
 */

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export type ResearchStatus =
  | 'queued'
  | 'planning'
  | 'researching'
  | 'analyzing'
  | 'drafting'
  | 'reviewing'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface ResearchSession {
  id: string;
  workspace_id: string;
  question: string;
  research_depth: ResearchDepth;
  status: ResearchStatus;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchCreatePayload {
  question: string;
  research_depth?: ResearchDepth;
}

export interface EvidenceItem {
  id: string;
  claim: string;
  supporting_excerpt: string;
  confidence: number;
  source_id?: string | null;
  source_title?: string;
  source_url?: string | null;
}

export interface ReportItem {
  id: string;
  title: string;
  summary?: string | null;
  content_markdown: string;
  citations?: CitationItem[];
}

export interface CitationItem {
  key: string;
  source_id?: string;
  source_title: string;
  source_url?: string | null;
  supporting_excerpt?: string;
}
