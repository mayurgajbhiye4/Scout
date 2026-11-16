import { Moon, Sun } from 'lucide-react';
import Wordmark from '@/components/brand/Wordmark';
import { ArrowCta } from '@/components/ui/arrow-cta';
import { useTheme } from '@/features/theme';
import { BarDivider, FLOATING_BAR, FLOATING_HEADER, IconButton } from '@/features/workspace/FloatingBar';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '#product', label: 'Product' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#features', label: 'Features' },
];

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
        <a href="#home" aria-label="Dusk, back to the top" className="flex h-9 shrink-0 items-center rounded-lg px-2">
          <Wordmark />
        </a>
        <BarDivider />
        <nav aria-label="Page sections" className="hidden items-center md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="ui-press flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <span className="hidden md:contents">
          <BarDivider />
        </span>
        <IconButton label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>
        <ArrowCta
          onClick={onStart}
          className="h-9 text-[13px] font-semibold text-[var(--ws-on-accent)]"
          fillClassName="glass-accent bg-[var(--ws-accent)]"
        >
          Start researching
        </ArrowCta>
      </div>
    </header>
  );
}
