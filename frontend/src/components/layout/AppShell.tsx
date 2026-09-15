import { Outlet, Navigate } from 'react-router-dom';
import TopBar from './TopBar';
import { useAuth } from '@/features/auth/useAuth';

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();

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
