import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The floating glass bar of the top header. Signed in and signed out, the header is one of these, centered. */
export const FLOATING_BAR =
  'pointer-events-auto flex h-12 max-w-full items-center gap-0.5 rounded-full border border-[var(--ws-line)] glass px-1.5 sm:gap-1';

/** The header column the bar (and, signed in, the session title under it) sits in, pinned 12px from the top. */
export const FLOATING_HEADER = 'pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-col items-center';

/** A divider between groups of controls in the bar. Phones drop it, to keep the bar within the screen. */
export function BarDivider() {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[var(--ws-line)] sm:block" aria-hidden />;
}

/** A square icon control, sized to sit in a floating bar. */
export function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'ui-press grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] cursor-pointer',
        className
      )}
    >
      {children}
    </button>
  );
}
