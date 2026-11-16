import { Brain, CircleCheck, Globe, Network, Sparkles, TriangleAlert, type LucideIcon } from '@/components/icons';
import { staggerDelay } from '@/lib/motion';
import Reveal from './Reveal';

const DETAILS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Globe, title: 'Web, when you want it', body: 'Dusk goes to the web when your library falls short, or on every question if you turn it on.' },
  { icon: Network, title: 'Research path', body: 'See what Dusk searched, what it kept and why, under every answer.' },
  { icon: Sparkles, title: 'Follow-ups', body: 'Starter questions for new sources and suggested next questions after each answer.' },
  { icon: Brain, title: 'Session memory', body: 'Rolling summaries keep long sessions in context without losing the thread.' },
  { icon: CircleCheck, title: 'Live ingest status', body: 'Watch each source go from queued to read to indexed, and retry any that fail.' },
  { icon: TriangleAlert, title: 'Guardrails', body: 'Link safety checks, prompt-injection defences and bounded agent loops.' },
];

/** The smaller features, after the large feature blocks: three columns of icon, title and one line. */
export default function FeatureGrid() {
  return (
    <Reveal stagger>
      <ul className="grid gap-px overflow-hidden rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-line)] sm:grid-cols-2 lg:grid-cols-3">
        {DETAILS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="ui-reveal-up group bg-[var(--mk-face)] p-6 sm:p-7" style={staggerDelay(i, 80)}>
            <Icon size={18} className="text-[var(--ws-accent-ink)]" aria-hidden />
            <h3 className="mt-4 text-[15px] font-semibold text-[var(--ws-ink)]">{title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--ws-ink-soft)]">{body}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
