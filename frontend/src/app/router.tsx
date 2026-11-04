/**
 * Application routes. Signing in has no page of its own: the auth dialog opens over the current one
 * (see features/auth/authEvents.ts).
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import HomeRoute from '@/app/HomeRoute';
import RootLayout from '@/app/RootLayout';
import NotFoundPage from '@/features/marketing/NotFoundPage';

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <HomeRoute />,
      },
      // Same element as `/`, so the research home stays mounted when the copilot's first message creates a session
      // and moves the URL to it; a remount there would cut off the reply that is streaming in
      {
        path: '/sessions/:sessionId',
        element: <HomeRoute />,
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
          { path: 'sources', element: <Navigate to="/" replace /> },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

export default router;
