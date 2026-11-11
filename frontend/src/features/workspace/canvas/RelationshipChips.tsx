import type { ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALL_RELATIONS, SHARED_VIEW, isConceptRelation, relationColor, type RelationCount } from './graphView';

interface RelationshipChipsProps {
  counts: { all: number; types: RelationCount[] };
  /** Concepts two or more of the scope's sources share; without any there's no Shared chip. */
  sharedCount?: number;
  value: string;
  onChange: (relationship: string) => void;
  isLight: boolean;
  /** Other map controls, at the start of the bar. */
  leading?: ReactNode;
  onRebuild?: () => void;
  isRebuilding?: boolean;
  rebuildError?: string | null;
  className?: string;
}

/** Picks what the map shows: '*' for all of it, what the sources share, or one relation type on its own. */
export default function RelationshipChips({
  counts,
  sharedCount = 0,
  value,
  onChange,
  isLight,
  leading,
  onRebuild,
  isRebuilding = false,
  rebuildError = null,
  className,
}: RelationshipChipsProps) {
  const chips = [
    { relationship: ALL_RELATIONS, count: counts.all, label: '*', title: 'Every relationship between concepts' },
    ...(sharedCount > 0
      ? [{ relationship: SHARED_VIEW, count: sharedCount, label: 'Shared', title: 'Only the concepts more than one source mentions' }]
      : []),
    ...counts.types.map((t) => ({ ...t, label: t.relationship, title: undefined as string | undefined })),
  ];

  return (
    <div className={cn('pointer-events-auto flex min-w-0 flex-col items-center gap-1.5', className)}>
      {rebuildError && !isRebuilding && (
        <p className="on-space text-[11.5px] text-[var(--ws-danger)]" role="alert">
          {rebuildError}
        </p>
      )}
      <div className="flex min-h-11 w-fit max-w-full items-center gap-1 rounded-4xl border border-[var(--ws-line)] glass px-1.5 py-1 lg:rounded-full">
        {leading}
        <div
          role="group"
          aria-label="Relationship types"
          // The chips scroll sideways without a scrollbar, so a mouse wheel has to be able to move them
          onWheel={(e) => {
            if (e.deltaY !== 0 && e.deltaX === 0) e.currentTarget.scrollLeft += e.deltaY;
          }}
          className="flex min-w-0 flex-wrap gap-1.5 [scrollbar-width:none] lg:flex-nowrap lg:overflow-x-auto lg:px-2 lg:[mask-image:linear-gradient(to_right,transparent,#000_8px,#000_calc(100%-8px),transparent)] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((chip) => {
            const active = chip.relationship === value;
            const shared = chip.relationship === SHARED_VIEW;
            const color =
              chip.relationship === ALL_RELATIONS ? 'var(--ws-ink-soft)' : shared ? 'var(--ws-accent)' : relationColor(chip.relationship, isLight);
            return (
              <button
                key={chip.relationship}
                type="button"
                aria-pressed={active}
                title={chip.title ?? `${chip.count} ${chip.label} ${chip.count === 1 ? 'relationship' : 'relationships'}`}
                onClick={() => onChange(chip.relationship)}
                style={active ? { backgroundColor: color } : { ['--chip' as string]: color }}
                className={cn(
                  'ui-press flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11.5px] font-semibold tracking-[0.02em] transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:brightness-110',
                  active
                    ? isLight
                      ? 'text-white'
                      : 'text-[#0b0b0f]'
                    : 'bg-[color-mix(in_srgb,var(--chip)_16%,transparent)] text-[var(--ws-ink)] hover:bg-[color-mix(in_srgb,var(--chip)_28%,transparent)]',
                  !isConceptRelation(chip.relationship) && chip.relationship !== ALL_RELATIONS && !shared && !active && 'text-[var(--ws-ink-soft)]'
                )}
              >
                {shared && <span className="h-2.5 w-2.5 rounded-full border border-dashed border-current" aria-hidden />}
                {chip.label}
                <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-[var(--ws-ink-faint)]')}>{chip.count}</span>
              </button>
            );
          })}
        </div>
        {onRebuild && (
          <button
            type="button"
            onClick={onRebuild}
            disabled={isRebuilding}
            aria-label={isRebuilding ? 'Rebuilding the map' : 'Rebuild the map'}
            title="Re-read your sources for missing links or descriptions"
            className="ui-press grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:cursor-default disabled:opacity-60"
          >
            {isRebuilding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
