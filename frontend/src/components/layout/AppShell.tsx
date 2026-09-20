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
      <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
        <TopBar />
        <main className="flex-1 min-h-0 pt-16 sm:pt-20 px-3 sm:px-6 md:px-8 pb-3 sm:pb-4 max-w-[1200px] w-full mx-auto flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <TopBar />
      <main className="pt-20 sm:pt-24 pb-16">
        <div className="p-5 md:p-8 max-w-[1200px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
