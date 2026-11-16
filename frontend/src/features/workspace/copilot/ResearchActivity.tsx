import { useId, useState } from 'react';
import { ChevronRight, Globe, Library, Loader2, PenLine, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pastLabel, type ResearchActivityItem } from './researchProgress';

function activityIcon(item: ResearchActivityItem) {
  if (item.state === 'active') return Loader2;
  if (item.kind === 'search') return item.source === 'web' ? Globe : Library;
  if (item.kind === 'check') return item.state === 'warn' ? ShieldAlert : ShieldCheck;
  if (item.kind === 'retry') return RefreshCw;
  return PenLine;
}

function StepList({ items }: { items: ResearchActivityItem[] }) {
  return (
    <ol className="ws-steps" aria-label="Research steps">
      {items.map((item) => {
        const Icon = activityIcon(item);
        const active = item.state === 'active';
        return (
          <li key={item.id} className="ws-step">
            <span className="ws-step-icon" aria-hidden>
              <Icon size={12} strokeWidth={1.75} className={active ? 'animate-spin' : undefined} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('ws-step-label', active && 'is-active', item.state === 'warn' && 'is-warn')}>
                {pastLabel(item)}
                {active && '…'}
              </p>
              {item.detail && <p className="ws-step-detail">{item.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The agent's research steps, grayed out between the question and the answer. While the reply is being researched
 * they show in full; once it's written they fold into one line that opens the record again.
 */
export function ResearchSteps({
  items,
  live,
  summary,
  fallback,
}: {
  items: ResearchActivityItem[];
  live: boolean;
  summary?: string;
  fallback?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (live) {
    if (items.length === 0) {
      return (
        <p className="ws-step-label is-active flex items-center gap-2">
          <Loader2 size={12} strokeWidth={1.75} className="animate-spin" aria-hidden />
          {fallback ?? 'Researching'}…
        </p>
      );
    }
    return <StepList items={items} />;
  }

  if (items.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="ws-step-label -ml-2 flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink-soft)] cursor-pointer"
      >
        {summary ?? 'Research steps'}
        <ChevronRight size={13} className={cn('transition-transform duration-200', open && 'rotate-90')} aria-hidden />
      </button>
      {open && (
        <div id={listId} className="ui-in-fade mt-2">
          <StepList items={items} />
        </div>
      )}
    </div>
  );
}
