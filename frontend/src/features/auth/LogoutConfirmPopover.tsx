import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { soundEffects } from '@/lib/soundEffects';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

interface LogoutConfirmPopoverProps {
  user?: { name?: string; email?: string } | null;
  children: React.ReactNode;
  onLogout: () => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

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
    soundEffects.playLogout();
    setOpen(false);
    onLogout();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
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
        className="w-[300px] sm:w-[320px] p-0 overflow-hidden bg-[#141416] border-[#27272a] rounded-none shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-none bg-red-500/10 border border-red-500/30 flex items-center justify-center text-[#EF4444] shrink-0">
              <LogOut size={16} />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-[#F4F4F5] leading-tight">
                Log out of Scout?
              </h4>
              <p className="text-[11px] text-[#A1A1AA] leading-normal mt-0.5">
                End your session? Any unsaved drafts will remain preserved.
              </p>
            </div>
          </div>

          {/* User profile card */}
          {user && (
            <div className="flex items-center gap-2.5 p-2 bg-[#18181b] border border-[#27272a] rounded-none">
              <div className="w-7 h-7 rounded-none bg-[#202026] border border-[#27272a] flex items-center justify-center text-xs font-semibold text-[#3b82f6] shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-[#F4F4F5] truncate">
                  {user?.name || 'Account'}
                </span>
                {user?.email && (
                  <span className="text-[10px] text-[#71717A] truncate">
                    {user.email}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 py-2.5 bg-[#121214] border-t border-[#27272a] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="rounded-none text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#202024] px-3 h-7 text-xs cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            className="rounded-none bg-[#EF4444] text-white hover:bg-[#DC2626] text-xs font-medium h-7 px-3 cursor-pointer flex items-center gap-1.5"
          >
            <LogOut size={12} />
            <span>Log Out</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
