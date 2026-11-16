import type { ReactNode } from 'react';
import { introDelay } from '@/lib/motion';
import Reveal from './Reveal';

interface FeatureBlockProps {
  /** Short mono label above the heading, e.g. "1.0 Sources". */
  label: string;
  title: ReactNode;
  body: ReactNode;
  /** What the visual shows, for screen readers; the visual itself is a picture of the app, not working controls. */
  visualLabel: string;
  visual: ReactNode;
}

/** One product feature: a large heading at the left, its copy at the right, then a picture of it in the app. */
export default function FeatureBlock({ label, title, body, visualLabel, visual }: FeatureBlockProps) {
  return (
    <section className="flex flex-col">
      <Reveal stagger className="grid gap-5 md:grid-cols-2 md:gap-12">
        <div>
          <span className="ui-reveal-fade font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ws-ink-faint)]">{label}</span>
          <h3
            className="ui-reveal-up mt-3 text-balance font-reading text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--ws-ink)] sm:text-[44px]"
            style={introDelay(60)}
          >
            {title}
          </h3>
        </div>
        <p className="ui-reveal-up max-w-[460px] text-[16px] leading-relaxed text-[var(--ws-ink-soft)] md:pt-8 md:text-[17px]" style={introDelay(140)}>
          {body}
        </p>
      </Reveal>

      <Reveal stagger storyDelay={900} className="mt-10 sm:mt-12">
        <figure
          aria-label={visualLabel}
          className="ui-reveal-card mk-fade-bottom relative overflow-hidden rounded-4xl border border-[var(--ws-line)] glass p-4 sm:p-6"
          style={introDelay(120)}
        >
          <div aria-hidden>{visual}</div>
        </figure>
      </Reveal>
    </section>
  );
}
