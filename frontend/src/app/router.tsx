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
import ResearchExecutionPage from '@/features/research/ResearchExecutionPage';

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
      { index: true, element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: 'dashboard', element: <Navigate to="/" replace /> },
      { path: 'sessions', element: <Navigate to="/" replace /> },
      { path: 'sessions/:sessionId', element: <ResearchExecutionPage /> },
      { path: 'sources', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default router;

