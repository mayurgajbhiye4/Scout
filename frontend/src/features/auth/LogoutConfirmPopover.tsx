import { useState } from 'react';
import { LogOut } from '@/components/icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface LogoutConfirmPopoverProps {
  user?: { name?: string; email?: string } | null;
  children: React.ReactNode;
  onLogout: () => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ws-dock)]';

/**
 * The account popover behind the avatar in the top bar: who is signed in, then a way to log out. Drawn in the
 * workspace's own tokens, since it opens over the workspace (in a portal, so it sets `font-ui` itself).
 */
export default function LogoutConfirmPopover({
  user,
  children,
  onLogout,
  side = 'top',
  align = 'start',
  sideOffset = 6,
}: LogoutConfirmPopoverProps) {
  const [open, setOpen] = useState(false);

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    onLogout();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        onClick={(e) => e.stopPropagation()}
        className="font-ui w-[min(300px,calc(100vw-1.5rem))] rounded-4xl glass-strong p-5 text-left text-[var(--ws-ink)] dark:border-[var(--ws-line)] dark:text-[var(--ws-ink)] dark:shadow-[var(--ws-shadow)]"
      >
        {/* Who is signed in: the same avatar as the button that opened this, larger */}
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--ws-accent-wash)] text-[15px] font-semibold text-[var(--ws-accent-ink)] ring-1 ring-[var(--ws-accent)]/30">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-tight tracking-tight">{user?.name || 'Your account'}</p>
            {user?.email && (
              <p className="mt-0.5 truncate text-[12.5px] leading-tight text-[var(--ws-ink-faint)]" title={user.email}>
                {user.email}
              </p>
            )}
          </div>
        </div>

        {/* Clicking away or Esc closes it, so logging out is the one action */}
        <button
          type="button"
          onClick={handleConfirm}
          className={`ui-press mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--ws-danger)]/10 text-[13px] font-semibold text-[var(--ws-danger)] ring-1 ring-[var(--ws-danger)]/25 hover:bg-[var(--ws-danger)]/15 hover:ring-[var(--ws-danger)]/40 cursor-pointer ${FOCUS_RING}`}
        >
          <LogOut size={14} />
          Log out
        </button>
      </PopoverContent>
    </Popover>
  );
}
