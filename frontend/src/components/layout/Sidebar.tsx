import { NavLink, useParams } from 'react-router-dom';
import { Home, FolderKanban, Settings, Database, BrainCircuit, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DRAWER_WIDTH = 260;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export default function Sidebar({ open, onClose, isMobile }: SidebarProps) {
  const { workspaceId } = useParams();

  const mainNav = [
    { name: 'Dashboard', path: '/dashboard', icon: <Home size={18} /> },
  ];

  const workspaceNav = workspaceId ? [
    { name: 'Overview', path: `/workspaces/${workspaceId}`, icon: <FolderKanban size={18} />, end: true },
    { name: 'Research Sessions', path: `/workspaces/${workspaceId}/research`, icon: <BrainCircuit size={18} />, end: false },
    { name: 'Knowledge Sources', path: `/workspaces/${workspaceId}/sources`, icon: <Database size={18} />, end: false },
    { name: 'Settings', path: `/workspaces/${workspaceId}/settings`, icon: <Settings size={18} />, end: false },
  ] : [];

  const drawerContent = (
    <div className="flex flex-col h-full pt-4 overflow-y-auto">
      {/* Global nav */}
      <div className="px-4 mb-1">
        <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#71717A] px-2 mb-2">Global</p>
        {mainNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 mb-0.5',
                isActive
                  ? 'bg-white/10 text-[#F4F4F5]'
                  : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/5'
              )
            }
          >
            <span className="shrink-0">{item.icon}</span>
            <span>{item.name}</span>
          </NavLink>
        ))}
      </div>

      {/* Workspace nav */}
      {workspaceNav.length > 0 && (
        <div className="px-4 mt-6 mb-1">
          <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#71717A] px-2 mb-2">Current Workspace</p>
          {workspaceNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={isMobile ? onClose : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 mb-0.5',
                  isActive
                    ? 'bg-white/10 text-[#F4F4F5]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/5'
                )
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
          />
        )}
        {/* Drawer */}
        <aside
          className={cn(
            'fixed top-16 left-0 bottom-0 z-50 bg-[#0B0B0E] border-r border-[#27272A] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            open ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{ width: DRAWER_WIDTH }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-[#71717A] hover:text-[#F4F4F5] hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
          {drawerContent}
        </aside>
      </>
    );
  }

  return (
    <aside
      className="fixed top-16 left-0 bottom-0 hidden md:flex flex-col bg-[#0B0B0E] border-r border-[#27272A] z-30"
      style={{ width: DRAWER_WIDTH }}
    >
      {drawerContent}
    </aside>
  );
}
