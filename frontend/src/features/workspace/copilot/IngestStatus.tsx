import { Check, Loader2, RotateCw, X } from 'lucide-react';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';
import { KIND_ICON } from '../canvas/addSourceOptions';
import { kindColor } from '../sourceMeta';
import { INGEST_PHASE_COPY as PHASE_COPY, type PendingSource } from '../useWorkspaceData';

// More than this and the newest show, with a count of the rest
const MAX_ROWS = 4;

interface IngestStatusProps {
  items: PendingSource[];
  onRetry: (tempId: string) => void;
  onDismiss: (tempId: string) => void;
}

/** Sources being added, from the globe or anywhere else, as they're read, indexed, and ready or failed. */
export default function IngestStatus({ items, onRetry, onDismiss }: IngestStatusProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const shown = items.slice(0, MAX_ROWS);
  const more = items.length - shown.length;

  return (
    <section aria-label="Sources being added" aria-live="polite" className="ui-in-up rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-card)] px-1 py-1">
      <ul className="flex flex-col">
        {shown.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const ingesting = item.status === 'ingesting';
          const failed = item.status === 'failed';
          return (
            <li key={item.tempId} className="relative flex items-center gap-2.5 overflow-hidden rounded-full py-1.5 pl-2 pr-1">
              <Icon size={15} className="shrink-0" style={{ color: kindColor(item.kind, isLight) }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium" title={item.title}>{item.title}</p>
                <p
                  className={cn(
                    'flex items-center gap-1 truncate text-[11.5px]',
                    failed ? 'text-[var(--ws-danger)]' : ingesting ? 'text-[var(--ws-ingest)]' : 'text-[var(--ws-ink-faint)]'
                  )}
                  title={failed ? item.error : undefined}
                >
                  {ingesting && <Loader2 size={11} className="shrink-0 animate-spin" aria-hidden />}
                  {item.status === 'ready' && <Check size={11} className="shrink-0 text-[var(--ws-accent-ink)]" aria-hidden />}
                  {ingesting
                    ? PHASE_COPY[item.phase ?? 'reading']
                    : failed
                      ? item.error || "Couldn't add this source"
                      : `Ready, ${item.chunkCount ?? 1} ${item.chunkCount === 1 ? 'passage' : 'passages'} indexed`}
                </p>
              </div>
              {failed && (
                <button
                  type="button"
                  onClick={() => onRetry(item.tempId)}
                  aria-label={`Retry adding ${item.title}`}
                  title="Retry"
                  className="ui-press grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                >
                  <RotateCw size={13} />
                </button>
              )}
              {!ingesting && (
                <button
                  type="button"
                  onClick={() => onDismiss(item.tempId)}
                  aria-label={`Dismiss ${item.title}`}
                  title="Dismiss"
                  className="ui-press grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
              {ingesting && (
                <span className="absolute inset-x-2 bottom-0 h-[2px] overflow-hidden rounded-full" aria-hidden>
                  <span className="ws-ingest-bar block h-full w-2/5 bg-[var(--ws-ingest)]" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {more > 0 && <p className="px-2 pb-1 pt-0.5 text-[11.5px] text-[var(--ws-ink-faint)]">and {more} more in Sources</p>}
    </section>
  );
}
