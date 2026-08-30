/**
 * Application routes.
 *
 * Routes map directly to the plan's Section 25:
 *   /login, /register, /dashboard,
 *   /workspaces/:workspaceId,
 *   /workspaces/:workspaceId/research/:researchId,
 *   /workspaces/:workspaceId/sources,
 *   /workspaces/:workspaceId/settings
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import LandingPage from '@/features/landing/LandingPage';
import DashboardPage from '@/features/workspaces/DashboardPage';
import WorkspacePage from '@/features/workspaces/WorkspacePage';
import ResearchComposer from '@/features/research/ResearchComposer';
import ResearchExecutionPage from '@/features/research/ResearchExecutionPage';
import ReportPage from '@/features/research/ReportPage';
import SourcesPage from '@/features/sources/SourcesPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
    ],
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'workspaces/:workspaceId', element: <WorkspacePage /> },
      { path: 'workspaces/:workspaceId/research/new', element: <ResearchComposer /> },
      { path: 'workspaces/:workspaceId/research/:sessionId', element: <ResearchExecutionPage /> },
      { path: 'workspaces/:workspaceId/research/:sessionId/report', element: <ReportPage /> },
      { path: 'workspaces/:workspaceId/sources', element: <SourcesPage /> },
    ],
  },
]);

export default router;
