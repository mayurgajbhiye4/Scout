import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';

// Menu links arrive 60ms apart, and the whole sequence never runs longer than 400ms
const MENU_STEP_MS = 60;
const MENU_MAX_DELAY_MS = 400;

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="font-arcade text-lg font-bold tracking-wider">SCOUT</span>
      <span className="flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 w-1 -skew-x-[18deg] bg-[var(--mk-accent)]" style={{ opacity: 1 - i * 0.22 }} />
        ))}
      </span>
    </span>
  );
}

interface MarketingNavProps {
  /** Asks the visitor to log in or sign up, in the auth card in the bottom right corner. */
  onStart: () => void;
}

/**
 * The pill nav for signed-out visitors, with the start action that opens the auth card in the bottom right corner. It sits under the home top bar and stays in view while the page
 * scrolls, inside the home view's own scroll area.
 */
export default function MarketingNav({ onStart }: MarketingNavProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const menuDelay = (i: number) => ({ transitionDelay: open ? `${Math.min(i * MENU_STEP_MS, MENU_MAX_DELAY_MS)}ms` : '0ms' });

  return (
    <div className="mk-scope contents">
      <header className="sticky top-0 z-30 flex justify-center px-4 py-3">
        <nav
          aria-label="Scout"
          className="flex items-center gap-1 rounded-full border border-[var(--mk-line)] bg-[var(--mk-glass)] p-1 pl-4 backdrop-blur-md"
        >
          <a href="#home" aria-label="Back to the top" className="mr-2 rounded-full sm:mr-4">
            <Wordmark />
          </a>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            className="mk-press hidden h-9 w-9 place-items-center rounded-full text-[var(--mk-ink-soft)] hover:bg-[var(--mk-raised)] hover:text-[var(--mk-ink)] md:grid"
          >
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            type="button"
            onClick={onStart}
            className="mk-press whitespace-nowrap rounded-full bg-[var(--mk-accent)] px-3 py-2 text-sm font-semibold text-[var(--mk-on-accent)] hover:opacity-90"
          >
            Start researching
          </button>

          {/* Two drawn bars that turn into a cross */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mk-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="mk-press relative grid h-9 w-9 place-items-center rounded-full text-[var(--mk-ink)] hover:bg-[var(--mk-raised)] md:hidden"
          >
            <span className={cn('mk-menu-bar absolute h-px w-4 bg-current', open ? 'rotate-45' : '-translate-y-1')} />
            <span className={cn('mk-menu-bar absolute h-px w-4 bg-current', open ? '-rotate-45' : 'translate-y-1')} />
          </button>
        </nav>
      </header>

      <div
        id="mk-menu"
        className={cn('mk-menu fixed inset-0 z-50 bg-[var(--mk-panel)] backdrop-blur-xl md:hidden', !open && 'pointer-events-none invisible')}
        data-open={open}
        aria-hidden={!open}
      >
        <ul className="flex flex-col gap-2 px-6 pt-24">
          <li>
            <button
              ref={firstItemRef}
              type="button"
              onClick={toggleTheme}
              className="mk-menu-link flex items-center gap-3 py-2 text-lg font-semibold text-[var(--mk-ink-soft)]"
              style={menuDelay(0)}
            >
              {isLight ? <Moon size={20} /> : <Sun size={20} />}
              {isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
