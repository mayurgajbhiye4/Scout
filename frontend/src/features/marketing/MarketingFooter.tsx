import { Moon, Sun } from 'lucide-react';
import Wordmark from '@/components/brand/Wordmark';
import { ArrowCta } from '@/components/ui/arrow-cta';
import { useTheme } from '@/features/theme';
import { IconButton } from '@/features/workspace/FloatingBar';
import { introDelay } from '@/lib/motion';
import Reveal from './Reveal';

const PAGE_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#features', label: 'Features' },
];

const SOURCE_TYPES = ['YouTube videos', 'PDFs', 'GitHub repos', 'Web pages', 'Notes and docs'];

/** The close of the visitor page: a two-line call to action over the last landscape, then the footer. */
export default function MarketingFooter({ onStart }: { onStart: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <section aria-labelledby="mk-cta" className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
        <Reveal stagger className="flex flex-col items-center">
          <h2
            id="mk-cta"
            className="ui-reveal-up on-space text-balance font-reading text-[44px] font-semibold leading-[1.02] tracking-[-0.025em] text-[var(--ws-ink)] sm:text-[72px]"
          >
            Read less.
            <br />
            Know more.
          </h2>
          <div className="ui-reveal-up mt-9 flex flex-wrap items-center justify-center gap-3" style={introDelay(140)}>
            <ArrowCta
              onClick={onStart}
              className="h-11 text-[14px] font-semibold text-[var(--ws-on-accent)]"
              fillClassName="glass-accent bg-[var(--ws-accent)]"
            >
              Start researching
            </ArrowCta>
            <a
              href="#architecture"
              className="ui-press flex h-11 items-center rounded-lg border border-[var(--ws-line)] glass px-5 text-[14px] font-semibold text-[var(--ws-ink)] hover:border-[var(--ws-line-strong)]"
            >
              See how it works
            </a>
          </div>
        </Reveal>
      </section>

      <footer className="relative overflow-hidden border-t border-[var(--ws-line)] bg-[var(--mk-footer)] px-4 pt-10 backdrop-blur-md sm:px-6">
        <div className="mx-auto grid w-full max-w-[1120px] grid-cols-2 gap-10 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col items-start gap-4 sm:col-span-1">
            <Wordmark />
            <p className="max-w-[300px] text-[14px] leading-relaxed text-[var(--ws-ink-soft)]">
              A research workspace that reads your sources, maps their ideas and answers with citations.
            </p>
            <IconButton label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme} className="-ml-2">
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </IconButton>
          </div>
          <nav aria-label="Footer">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ws-ink-faint)]">Dusk</h2>
            <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
              {PAGE_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-[var(--ws-ink-soft)] transition-colors hover:text-[var(--ws-ink)]">
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <button type="button" onClick={onStart} className="cursor-pointer text-[var(--ws-ink-soft)] transition-colors hover:text-[var(--ws-ink)]">
                  Log in
                </button>
              </li>
            </ul>
          </nav>
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ws-ink-faint)]">Reads</h2>
            <ul className="mt-4 flex flex-col gap-2.5 text-[14px] text-[var(--ws-ink-soft)]">
              {SOURCE_TYPES.map((type) => (
                <li key={type}>{type}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-10 w-full max-w-[1120px] text-[12px] text-[var(--ws-ink-faint)]">© {new Date().getFullYear()} Dusk</p>

        {/* The name, set large and cut off by the bottom edge */}
        <div
          className="mk-footer-mark pointer-events-none mt-4 select-none text-center font-wordmark font-bold leading-[0.8]"
          aria-hidden
        >
          Dusk
        </div>
      </footer>
    </div>
  );
}
