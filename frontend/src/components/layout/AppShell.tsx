import { Outlet, Navigate, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import { useAuth } from '@/features/auth/useAuth';

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if we are on a single-session chat page: e.g. /sessions/:sessionId
  const isChatSession = location.pathname.startsWith('/sessions/') && location.pathname !== '/sessions';

  if (isChatSession) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#0d0d0f] text-foreground flex flex-col">
        <TopBar />
        <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-foreground flex flex-col">
      <TopBar />
      <main className="flex-1 min-h-0 w-full">
        <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
