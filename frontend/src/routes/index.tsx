/**
 * Route path constants and route definitions for AI Research Workspace.
 */

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  WORKSPACE: (workspaceId: string) => `/workspaces/${workspaceId}/research`,
  RESEARCH_COMPOSER: (workspaceId: string) => `/workspaces/${workspaceId}/research/new`,
  RESEARCH_SESSION: (workspaceId: string, sessionId: string) => `/workspaces/${workspaceId}/research/${sessionId}`,
  RESEARCH_REPORT: (workspaceId: string, sessionId: string) => `/workspaces/${workspaceId}/research/${sessionId}/report`,
  SOURCES: (workspaceId: string) => `/workspaces/${workspaceId}/sources`,
};

export default ROUTES;
