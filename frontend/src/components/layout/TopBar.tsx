
import { Link } from 'react-router-dom';
import { Menu as MenuIcon, Settings, LogOut } from 'lucide-react';
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

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#0B0B0E] border-b border-[#27272A] flex items-center px-4 justify-between">
      {/* Left: mobile menu toggle + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/5 transition-colors"
          aria-label="Open menu"
        >
          <MenuIcon size={20} />
        </button>

        <Link
          to="/"
          className="flex items-center gap-2 text-white no-underline hover:opacity-85 transition-opacity select-none"
        >
          <span className="font-semibold text-lg tracking-tight">Scout</span>
        </Link>
      </div>

      {/* Right: user menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="focus:outline-none rounded-full cursor-pointer">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <p className="font-medium text-[#F4F4F5] truncate">{user?.name}</p>
            <p className="text-xs text-[#71717A] font-normal truncate">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Settings size={14} className="mr-2 text-[#71717A]" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => logout()}
            className="text-[#EF4444] hover:text-[#EF4444] focus:text-[#EF4444] hover:bg-red-950/30 focus:bg-red-950/30"
          >
            <LogOut size={14} className="mr-2" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
