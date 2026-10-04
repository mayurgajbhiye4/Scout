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

export const knowledgeApi = {
  getKnowledgeGraph: async (): Promise<KnowledgeGraphData> => {
    const { data } = await apiClient.get('/knowledge/graph');
    return data;
  },

  getCuriosity: async (): Promise<CuriosityData> => {
    const { data } = await apiClient.get('/knowledge/memory/curiosity');
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
