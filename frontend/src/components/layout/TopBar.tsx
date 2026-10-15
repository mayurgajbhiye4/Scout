import { Link, useLocation } from 'react-router-dom';
import { LogOut, BrainCircuit, Database, Loader2 } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
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

function GlobalTabs() {
  const location = useLocation();
  const isFetchingSessions = useIsFetching({ queryKey: ['sessions'] }) > 0;
  const isFetchingSources = useIsFetching({ queryKey: ['sources'] }) > 0;

  const tabs = [
    {
      label: 'Sessions',
      path: `/sessions`,
      icon: BrainCircuit,
      isFetching: isFetchingSessions,
    },
    {
      label: 'Sources',
      path: `/sources`,
      icon: Database,
      isFetching: isFetchingSources,
    },
  ];

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-none bg-[#18181b] border border-[#27272a]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'relative flex items-center gap-2 px-3 py-1 rounded-none text-xs font-medium transition-colors select-none',
              active
                ? 'bg-[#2563eb] text-white'
                : 'text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#202024]'
            )}
          >
            {tab.isFetching ? (
              <Loader2 size={13} className="shrink-0 animate-spin text-white" />
            ) : (
              <Icon size={13} className={cn('shrink-0', active ? 'text-white' : 'text-[#3b82f6]')} />
            )}
            <span>{tab.label}</span>
            {tab.isFetching && (
              <span className="w-1.5 h-1.5 rounded-none bg-white animate-ping" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const isFetchingSessions = useIsFetching({ queryKey: ['sessions'] }) > 0;

  return (
    <header className="sticky top-0 left-0 right-0 z-40 w-full h-12 bg-[#141416] border-b border-[#27272a] px-4 sm:px-6 flex items-center justify-between select-none">
      {/* Sleek top indeterminate gradient loading bar when sessions are fetching */}
      {isFetchingSessions && (
        <div className="absolute top-0 inset-x-0 h-[2px] overflow-hidden pointer-events-none">
          <div className="h-full w-full bg-[#2563eb] animate-pulse" />
        </div>
      )}

      {/* Left: Logo */}
      <Link
        to="/"
        className="text-[#f4f4f5] no-underline hover:text-white transition-colors select-none shrink-0 flex items-center gap-2"
      >
        <span className="font-semibold text-base sm:text-lg tracking-tight leading-none">Scout</span>
      </Link>

      {/* Center: Navigation tabs */}
      <div className="flex items-center justify-center min-w-0">
        <GlobalTabs />
      </div>

      {/* Right: user menu */}
      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 p-0.5 rounded-none focus:outline-none ring-0 hover:border-[#2563eb] border border-transparent transition-colors select-none cursor-pointer"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7 rounded-none border border-[#27272a]">
                <AvatarFallback className="text-xs bg-[#18181b] text-[#f4f4f5] font-medium rounded-none">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-56 bg-[#141416] border border-[#27272a] rounded-none p-1.5"
          >
            <DropdownMenuLabel className="px-3 py-2">
              <p className="font-medium text-[#f4f4f5] text-sm truncate">{user?.name}</p>
              <p className="text-xs text-[#71717a] font-normal truncate mt-0.5">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#27272a] my-1" />
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-[#ef4444] hover:text-[#ef4444] focus:text-[#ef4444] hover:bg-[#202024] focus:bg-[#202024] rounded-none cursor-pointer py-2 px-3 text-xs font-medium"
            >
              <LogOut size={14} className="mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
