import { apiClient } from './client';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  /** One-sentence summary from extraction; absent for sources, you, and entities extracted before descriptions existed. */
  description?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  description?: string | null;
}

export interface ReextractResult {
  queued: number;
  already_running: boolean;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CuriosityData {
  suggested_prompts: string[];
  curiosity_map: Array<{
    id: string;
    label: string;
    type: string;
    relationship: string;
  }>;
}

export interface GraphSummary {
  id: string;
  title: string;
  description?: string;
  type: 'universal' | 'document' | 'memory' | string;
  source_id?: string;
  node_count: number;
  edge_count: number;
  top_entities: string[];
  created_at?: string;
}

export const knowledgeApi = {
  listGraphs: async (params?: { skip?: number; limit?: number }): Promise<GraphSummary[]> => {
    const { data } = await apiClient.get('/knowledge/graphs', { params });
    return data;
  },

  getKnowledgeGraph: async (graphId?: string): Promise<KnowledgeGraphData> => {
    const { data } = await apiClient.get('/knowledge/graph', {
      params: graphId ? { graph_id: graphId } : undefined,
    });
    return data;
  },

  /** Re-extracts typed, described relations for every indexed source. Returns at once; the rebuild runs server-side. */
  reextractGraph: async (): Promise<ReextractResult> => {
    const { data } = await apiClient.post('/knowledge/graph/reextract');
    return data;
  },

  getCuriosity: async (refresh?: boolean): Promise<CuriosityData> => {
    const { data } = await apiClient.get('/knowledge/memory/curiosity', {
      params: refresh ? { refresh: true } : undefined,
    });
    return data;
  },

  recordInteraction: async (payload: {
    action: string;
    target_node_id: string;
    target_label?: string;
    target_type?: string;
  }) => {
    const { data } = await apiClient.post('/knowledge/memory/interact', payload);
    return data;
  },
};
