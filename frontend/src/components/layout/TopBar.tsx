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
    <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] backdrop-blur-md">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'relative flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] select-none active:scale-95 hover:scale-[1.02]',
              active
                ? 'bg-gradient-to-r from-white/[0.14] to-white/[0.08] text-[#F4F4F5] border border-white/[0.18] shadow-[0_2px_10px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.15)] font-semibold'
                : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.06] border border-transparent'
            )}
          >
            {tab.isFetching ? (
              <Loader2 size={13} className="shrink-0 animate-spin text-[#E4E4E7]" />
            ) : (
              <Icon size={13} className={cn('shrink-0 transition-transform duration-200', active ? 'text-[#F4F4F5]' : 'text-[#71717A]')} />
            )}
            <span>{tab.label}</span>
            {tab.isFetching && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#E4E4E7] animate-ping" />
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
    <header className="fixed top-0 left-0 right-0 z-40 flex justify-center pt-4 px-4 pointer-events-none">
      <nav
        className={cn(
          // Base pill
          'relative overflow-hidden pointer-events-auto flex items-center justify-between gap-3 sm:gap-6 px-3 sm:px-4 py-2 rounded-full',
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
        {/* Sleek top indeterminate gradient loading bar when sessions are fetching */}
        {isFetchingSessions && (
          <div className="absolute top-0 inset-x-8 h-[2px] overflow-hidden rounded-full pointer-events-none">
            <div className="h-full w-full bg-gradient-to-r from-transparent via-white/50 via-[#E4E4E7] to-transparent animate-pulse" />
          </div>
        )}

        {/* Left: Logo */}
        <Link
          to="/"
          className="text-[#F4F4F5] no-underline hover:opacity-75 transition-opacity select-none shrink-0 flex items-center gap-2 pl-1"
        >
          <span className="font-semibold text-[22px] tracking-tight leading-none">Scout</span>
        </Link>


        {/* Center: Navigation pills */}
        <div className="flex items-center justify-center min-w-0">
          <GlobalTabs />
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
