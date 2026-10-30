import { Link, useLocation } from 'react-router-dom';
import { LogOut, BrainCircuit, Database, Loader2 } from '@/components/icons';
import { useIsFetching } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import ThemeToggle from '@/components/theme/ThemeToggle';
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
    <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'relative flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors select-none font-mono',
              active
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] hover:bg-white/80 dark:hover:bg-[#202024]'
            )}
          >
            {tab.isFetching ? (
              <Loader2 size={13} className="shrink-0 animate-spin text-current" />
            ) : (
              <Icon size={13} className={cn('shrink-0', active ? 'text-current' : 'text-primary')} />
            )}
            <span>{tab.label}</span>
            {tab.isFetching && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
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
    <header className="sticky top-0 left-0 right-0 z-40 w-full h-12 bg-white/95 dark:bg-[#141416]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#27272a] px-4 sm:px-6 flex items-center justify-between select-none transition-colors">
      {/* Sleek top indeterminate gradient loading bar when sessions are fetching */}
      {isFetchingSessions && (
        <div className="absolute top-0 inset-x-0 h-[2px] overflow-hidden pointer-events-none">
          <div className="h-full w-full bg-primary animate-pulse" />
        </div>
      )}

      {/* Left: Logo */}
      <Link
        to="/"
        className="text-slate-900 dark:text-[#f4f4f5] no-underline hover:text-primary transition-colors select-none shrink-0 flex items-center gap-2"
      >
        <span className="font-arcade text-base sm:text-lg tracking-wider uppercase font-bold text-primary">
          SCOUT
        </span>
      </Link>

      {/* Center: Navigation tabs */}
      <div className="flex items-center justify-center min-w-0">
        <GlobalTabs />
      </div>

      {/* Right: Theme toggle & user menu */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Light / Dark Mode Toggle */}
        <ThemeToggle showLabel size="default" />


        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 p-0.5 rounded-full focus:outline-none ring-0 hover:border-primary border border-transparent transition-colors select-none cursor-pointer"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7 rounded-full border border-slate-200 dark:border-[#27272a]">
                <AvatarFallback className="text-xs bg-slate-100 dark:bg-[#18181b] text-slate-900 dark:text-[#f4f4f5] font-semibold rounded-full">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-56 bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] rounded-2xl p-1.5 shadow-xl"
          >
            <DropdownMenuLabel className="px-3 py-2">
              <p className="font-semibold text-slate-900 dark:text-[#f4f4f5] text-sm truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-[#71717a] font-normal truncate mt-0.5">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-200 dark:bg-[#27272a] my-1" />
            <DropdownMenuItem
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl cursor-pointer"
            >
              <LogOut size={13} />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
