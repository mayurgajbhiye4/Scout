import { Globe, Library, Loader2, PenLine, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchActivityItem } from './researchProgress';

function activityIcon(item: ResearchActivityItem) {
  if (item.kind === 'search') return item.source === 'web' ? Globe : Library;
  if (item.kind === 'check') return item.state === 'warn' ? ShieldAlert : ShieldCheck;
  if (item.kind === 'retry') return RefreshCw;
  return PenLine;
}

/** Live timeline of the reply in progress: searches, the evidence check, the library retry and the web fallback. */
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
