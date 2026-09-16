import { Link, useParams, useLocation } from 'react-router-dom';
import { LogOut, BrainCircuit, Database } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/api/workspaces';

function WorkspaceTabs({ workspaceId }: { workspaceId: string }) {
  const location = useLocation();

  const { data: workspace } = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId),
    enabled: !!workspaceId,
  });

  const tabs = [
    {
      label: 'Research',
      path: `/workspaces/${workspaceId}/research`,
      icon: BrainCircuit,
      count: workspace?.research_count,
    },
    {
      label: 'Sources',
      path: `/workspaces/${workspaceId}/sources`,
      icon: Database,
      count: workspace?.source_count,
    },
  ];

  const isActive = (path: string) => {
    if (path.endsWith('/research')) {
      return (
        location.pathname.startsWith(path) ||
        location.pathname === `/workspaces/${workspaceId}` ||
        location.pathname === `/workspaces/${workspaceId}/`
      );
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'flex items-center gap-2 px-3.5 py-1 rounded-full text-xs sm:text-[13px] font-medium transition-all duration-200 select-none active:scale-[0.97]',
              active
                ? 'bg-white/[0.12] text-[#F4F4F5] border border-white/[0.15] shadow-[0_1px_4px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] font-semibold'
                : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] border border-transparent'
            )}
          >
            <Icon size={13} className={cn('shrink-0', active ? 'text-[#F4F4F5]' : 'text-[#71717A]')} />
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'text-[10px] leading-none font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center transition-colors',
                  active
                    ? 'bg-white/20 text-[#FFFFFF]'
                    : 'bg-white/[0.07] text-[#A1A1AA]'
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const { workspaceId: paramWorkspaceId } = useParams<{ workspaceId?: string }>();
  const location = useLocation();

  // Robust detection of workspaceId even if TopBar is rendered at parent route level
  const match = location.pathname.match(/^\/workspaces\/([^/]+)/);
  const workspaceId = paramWorkspaceId || match?.[1];

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex justify-center pt-4 px-4 pointer-events-none">
      <nav
        className={cn(
          // Base pill
          'pointer-events-auto flex items-center justify-between gap-3 sm:gap-6 px-3 sm:px-4 py-2 rounded-full',
          // Liquid glass base (driven by CSS variables)
          'bg-[var(--pill-bg)] border border-[var(--pill-border)]',
          'backdrop-blur-[18px] -webkit-backdrop-blur-[18px]',
          'shadow-[var(--pill-shadow)]',
          // Hover: liquid glass brightens + glow ring
          'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          'hover:bg-[var(--pill-hover-bg)] hover:border-[var(--pill-hover-border)]',
          'hover:shadow-[var(--pill-hover-shadow)]',
          // width
          'w-full max-w-[720px]'
        )}
      >
        {/* Left: Logo */}
        <Link
          to="/"
          className="text-[#F4F4F5] no-underline hover:opacity-75 transition-opacity select-none shrink-0 flex items-center gap-2 pl-1"
        >
          <span className="font-semibold text-[22px] tracking-tight leading-none">Scout</span>
        </Link>

        {/* Center: Navigation pills */}
        <div className="flex items-center justify-center min-w-0">
          {workspaceId ? <WorkspaceTabs workspaceId={workspaceId} /> : null}
        </div>

        {/* Right: user menu */}
        <div className="flex items-center gap-2 shrink-0 pr-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 p-0.5 rounded-full focus:outline-none ring-0 hover:ring-2 hover:ring-white/20 transition-all select-none cursor-pointer"
                aria-label="User menu"
              >
                <Avatar className="h-7 w-7 border border-white/15">
                  <AvatarFallback className="text-xs bg-[#18181B] text-[#F4F4F5] font-medium">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-56 bg-[#111114]/95 backdrop-blur-xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.6)] rounded-2xl p-1.5"
            >
              <DropdownMenuLabel className="px-3 py-2">
                <p className="font-medium text-[#F4F4F5] text-sm truncate">{user?.name}</p>
                <p className="text-xs text-[#71717A] font-normal truncate mt-0.5">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10 my-1" />
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-[#EF4444] hover:text-[#EF4444] focus:text-[#EF4444] hover:bg-red-950/30 focus:bg-red-950/30 rounded-xl cursor-pointer py-2 px-3 text-xs font-medium"
              >
                <LogOut size={14} className="mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
