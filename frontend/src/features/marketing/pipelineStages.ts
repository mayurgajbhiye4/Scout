import { Brain, FileText, Layers, MessageSquare, Network, Search, type LucideIcon } from '@/components/icons';

export interface PipelineStage {
  icon: LucideIcon;
  title: string;
  body: string;
  tech: string;
}

// The path every question takes, as docs/architecture.md describes it. The visitor page draws all six; the
// workspace draws the first three while a source is read and the last three while an answer is written.
export const PIPELINE_STAGES: PipelineStage[] = [
  { icon: FileText, title: 'Ingest', body: 'Videos, PDFs, repos, pages and notes are fetched and read.', tech: 'URL safety checks' },
  { icon: Layers, title: 'Chunk & embed', body: 'Text is split into passages and embedded for search.', tech: 'pgvector' },
  { icon: Network, title: 'Knowledge graph', body: 'Concepts and how they relate, linked to their sources.', tech: 'Neo4j' },
  { icon: Search, title: 'Hybrid retrieval', body: 'Meaning, keywords and the graph, filtered for relevance.', tech: 'Semantic + keyword + graph' },
  { icon: Brain, title: 'Corrective agent', body: 'Grades the evidence, rewrites the query or goes to the web.', tech: 'LangGraph' },
  { icon: MessageSquare, title: 'Cited answer', body: 'Streams in, each claim tied to a passage you can open.', tech: 'Server-sent events' },
];

/** The corrective agent, which can send a question back to retrieval. */
export const AGENT_STAGE = 4;

/** The stages a source goes through on its way into the library. */
export const INGEST_STAGES = PIPELINE_STAGES.slice(0, 3);
/** The stages a question goes through on its way to an answer. */
export const ANSWER_STAGES = PIPELINE_STAGES.slice(3);
