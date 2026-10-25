import { useState } from 'react';
import { ArrowLeftRight, ChevronDown, Globe, Library, Loader2, PenLine, Route, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ResearchTrace } from '@/api/chat';
import { cn } from '@/lib/utils';
import { foundLabel, type ResearchActivityItem } from './researchProgress';

function activityIcon(item: ResearchActivityItem) {
  if (item.kind === 'search') return item.source === 'web' ? Globe : Library;
  if (item.kind === 'check') return item.state === 'warn' ? ShieldAlert : ShieldCheck;
  if (item.kind === 'retry') return ArrowLeftRight;
  return PenLine;
}

/** Live timeline of the reply in progress: searches, the evidence check, and retries that switch source. */
export function ResearchActivityList({ items, fallback }: { items: ResearchActivityItem[]; fallback: string }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-[var(--ws-ink-soft)]">{fallback}…</p>;
  }
  return (
    <ol className="flex flex-col gap-2" aria-label="Research progress">
      {items.map((item) => {
        const Icon = item.state === 'active' ? Loader2 : activityIcon(item);
        return (
          <li key={item.id} className="flex min-w-0 gap-2.5">
            <span
              className={cn(
                'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full',
                item.state === 'warn'
                  ? 'bg-[var(--ws-card-hover)] text-[var(--ws-ink)] ring-1 ring-[var(--ws-line-strong)]'
                  : item.kind === 'retry' || item.state === 'active'
                    ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)]'
                    : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-soft)]'
              )}
            >
              <Icon size={12} className={item.state === 'active' ? 'animate-spin' : undefined} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[13px] leading-5',
                  item.state === 'active' || item.kind === 'retry' ? 'font-medium text-[var(--ws-ink)]' : 'text-[var(--ws-ink-soft)]'
                )}
              >
                {item.label}
                {item.state === 'active' && '…'}
              </p>
              {item.detail && <p className="line-clamp-2 text-[11.5px] leading-snug text-[var(--ws-ink-faint)]">{item.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Collapsible record of how an answer's evidence was found, shown when it took more than one search. */
export function ResearchPath({ trace }: { trace?: ResearchTrace | null }) {
  const [open, setOpen] = useState(false);
  const searches = trace?.searches ?? [];
  const retries = trace?.retries ?? 0;
  if (searches.length < 2 && retries === 0) return null;

  const sources = searches.map((s) => (s.source === 'web' ? 'web' : 'library'));
  const route = sources.filter((s, i) => i === 0 || s !== sources[i - 1]).join(' → ');
  const summary = [
    `${searches.length} searches`,
    retries > 0 ? `query rewritten ${retries}×` : null,
    route.includes('→') ? route : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mt-3 border-t border-[var(--ws-line)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-1.5 text-left text-[12px] text-[var(--ws-ink-soft)] hover:text-[var(--ws-ink)] cursor-pointer"
      >
        <Route size={13} className="shrink-0 text-[var(--ws-accent)]" />
        <span className="font-semibold text-[var(--ws-ink)]">Research path</span>
        <span className="min-w-0 truncate">· {summary}</span>
        <ChevronDown size={13} className={cn('ml-auto shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-1.5" aria-label="Searches run for this answer">
          {searches.map((s, i) => {
            const Icon = s.source === 'web' ? Globe : Library;
            const found = foundLabel(s.source, s.found);
            return (
              <li key={i} className="flex min-w-0 gap-2 text-[12px]">
                <span className="w-4 shrink-0 tabular-nums text-[var(--ws-ink-faint)]">{i + 1}.</span>
                <Icon size={13} className="mt-0.5 shrink-0 text-[var(--ws-ink-soft)]" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--ws-ink)]">{s.source === 'web' ? 'Web' : 'Library + knowledge graph'}</span>
                  {i > 0 && s.query !== searches[0]?.query &&<span className="text-[var(--ws-ink-faint)]"> · rewritten query</span>}
                  <p className="truncate text-[var(--ws-ink-soft)]" title={s.query}>
                    “{s.query}”
                  </p>
                </div>
                {found && (
                  <span className={cn('shrink-0', s.found === 0 ? 'font-medium text-[var(--ws-ink-soft)]' : 'text-[var(--ws-ink-faint)]')}>
                    {found}
                  </span>
                )}
              </li>
            );
          })}
          {trace?.verdict?.sufficient && retries > 0 && (
            <li className="flex items-center gap-1.5 pl-6 text-[11.5px] text-[var(--ws-accent-ink)]">
              <ShieldCheck size={12} /> Evidence confirmed sufficient after {retries} {retries === 1 ? 'retry' : 'retries'}
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
