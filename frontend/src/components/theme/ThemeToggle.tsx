import { useEffect } from 'react';
import { Sun, Moon } from '@/components/icons';
import { useTheme } from '@/features/theme/useTheme';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'default';
}

export default function ThemeToggle({
  className,
  showLabel = false,
  size = 'default',
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  // Global keyboard shortcut: Option/Alt + T or Cmd/Ctrl + Shift + L to toggle theme
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.altKey && e.key.toLowerCase() === 't') ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l')
      ) {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTheme]);

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isLight ? 'Switch to Dark Mode (Alt+T)' : 'Switch to Light Mode (Alt+T)'}
          className={cn(
            'group relative flex items-center gap-1.5 rounded-full border transition-all duration-200 cursor-pointer select-none active:scale-95 shrink-0',
            size === 'sm'
              ? 'px-1.5 py-1 text-[10px]'
              : 'px-2 sm:px-2.5 py-1 text-[11px]',
            isLight
              ? 'bg-[var(--ws-accent-wash)] border-[var(--ws-accent)]/30 text-[var(--ws-accent-ink)] hover:bg-[var(--ws-card-hover)] hover:border-[var(--ws-accent)]/50'
              : 'bg-white/[0.04] border-white/10 text-[#b1b4b4] hover:text-[#f4f4f5] hover:bg-white/[0.08] hover:border-[var(--ws-accent)]/30'
          , className)}
        >
          {isLight ? (
            <>
              <Sun
                size={size === 'sm' ? 11 : 12}
                className="text-[var(--ws-accent-ink)] transition-transform duration-300 group-hover:rotate-45"
              />
              {showLabel && (
                <span className="font-semibold tracking-wider text-[var(--ws-ink)] hidden sm:inline">
                  LIGHT
                </span>
              )}
            </>
          ) : (
            <>
              <Moon
                size={size === 'sm' ? 11 : 12}
                className="text-[#6fe0e6] transition-transform duration-300 group-hover:-rotate-12"
              />
              {showLabel && (
                <span className="font-normal tracking-wider text-[#b1b4b4] group-hover:text-[var(--ws-accent-ink)] hidden sm:inline">
                  DARK
                </span>
              )}
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {isLight ? 'Switch to Dark Mode (Alt+T)' : 'Switch to Light Mode (Alt+T)'}
      </TooltipContent>
    </Tooltip>
  );
}
