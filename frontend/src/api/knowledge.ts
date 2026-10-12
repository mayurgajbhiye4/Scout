import { apiClient } from './client';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
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
  listGraphs: async (): Promise<GraphSummary[]> => {
    const { data } = await apiClient.get('/knowledge/graphs');
    return data;
  },

  getKnowledgeGraph: async (graphId?: string): Promise<KnowledgeGraphData> => {
    const { data } = await apiClient.get('/knowledge/graph', {
      params: graphId ? { graph_id: graphId } : undefined,
    });
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
