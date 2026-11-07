import { Moon, Sun } from 'lucide-react';
import Wordmark from '@/components/brand/Wordmark';
import { useTheme } from '@/features/theme';
import { BarDivider, FLOATING_BAR, FLOATING_HEADER, IconButton } from '@/features/workspace/FloatingBar';
import { cn } from '@/lib/utils';

interface MarketingNavProps {
  /** Asks the visitor to log in or sign up, in the auth card in the bottom right corner. */
  onStart: () => void;
}

/**
 * The visitor header: the workspace's own centered pill, wordmark first, so signing in keeps the wordmark leading
 * the bar and only the controls after it change. Sits over the page, outside its scroll area.
 */
export default function MarketingNav({ onStart }: MarketingNavProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <header className={FLOATING_HEADER}>
      <div className={cn(FLOATING_BAR, 'ui-in-up')}>
        <a href="#home" aria-label="Scout, back to the top" className="flex h-9 shrink-0 items-center rounded-full px-2">
          <Wordmark />
        </a>
        <BarDivider />
        <IconButton label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>
        <button
          type="button"
          onClick={onStart}
          className="ui-press h-9 whitespace-nowrap rounded-full glass-accent bg-[var(--ws-accent)] px-3.5 text-[13px] font-semibold text-[var(--ws-on-accent)] hover:brightness-110 cursor-pointer"
        >
          Start researching
        </button>
      </div>
    </header>
  );
}
