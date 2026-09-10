import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import { useAuth } from '@/features/auth/useAuth';

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090B] text-[#A1A1AA] text-sm">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090B]">
      <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />

      <main className="flex-1 h-screen pt-16 overflow-auto bg-[#09090B] md:pl-[260px]">
        <div className="p-4 md:p-8 max-w-[1200px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
