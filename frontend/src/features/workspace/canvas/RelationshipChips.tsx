import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALL_RELATIONS, isConceptRelation, relationColor, type RelationCount } from './graphView';

interface RelationshipChipsProps {
  counts: { all: number; types: RelationCount[] };
  value: string;
  onChange: (relationship: string) => void;
  isLight: boolean;
  onRebuild?: () => void;
  isRebuilding?: boolean;
  rebuildError?: string | null;
  className?: string;
}

// Tag-shaped chips, pointed at both ends like a relationship arrow
const CHIP_SHAPE = 'polygon(7px 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 7px 100%, 0 50%)';

/** Picks which relation the map shows: '*' for every relation between concepts, or one type on its own. */
export default function RelationshipChips({
  counts,
  value,
  onChange,
  isLight,
  onRebuild,
  isRebuilding = false,
  rebuildError = null,
  className,
}: RelationshipChipsProps) {
  const total = counts.types.reduce((sum, t) => sum + t.count, 0);
  const chips = [
    { relationship: ALL_RELATIONS, count: counts.all, label: '*', title: 'Every relationship between concepts' },
    ...counts.types.map((t) => ({ ...t, label: t.relationship, title: undefined as string | undefined })),
  ];

  return (
    <div
      role="group"
      aria-label="Relationship types"
      className={cn(
        'pointer-events-auto rounded-4xl border border-[var(--ws-line)] bg-[var(--ws-glass)] p-3 shadow-[var(--ws-shadow-sm)] backdrop-blur-md',
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-[var(--ws-ink)]">
          Relationships <span className="font-normal text-[var(--ws-ink-faint)] tabular-nums">({total})</span>
        </p>
        {onRebuild && (
          <button
            type="button"
            onClick={onRebuild}
            disabled={isRebuilding}
            title="Re-read your sources for missing links or descriptions"
            className="ui-press -my-1 flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium text-[var(--ws-accent-ink)] hover:bg-[var(--ws-card-hover)] disabled:cursor-default disabled:opacity-60"
          >
            {isRebuilding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {isRebuilding ? 'Rebuilding…' : 'Rebuild'}
          </button>
        )}
      </div>
      <div className="flex max-h-[204px] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
        {chips.map((chip) => {
          const active = chip.relationship === value;
          const color = chip.relationship === ALL_RELATIONS ? 'var(--ws-ink-soft)' : relationColor(chip.relationship, isLight);
          return (
            <button
              key={chip.relationship}
              type="button"
              aria-pressed={active}
              title={chip.title ?? `${chip.count} ${chip.label} ${chip.count === 1 ? 'relationship' : 'relationships'}`}
              onClick={() => onChange(chip.relationship)}
              style={{ clipPath: CHIP_SHAPE, ...(active ? { backgroundColor: color } : { ['--chip' as string]: color }) }}
              className={cn(
                'ui-press flex h-7 cursor-pointer items-center gap-1.5 px-3.5 text-[11.5px] font-semibold tracking-[0.02em] transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:brightness-110',
                active
                  ? isLight
                    ? 'text-white'
                    : 'text-[#0b0b0f]'
                  : 'bg-[color-mix(in_srgb,var(--chip)_16%,transparent)] text-[var(--ws-ink)] hover:bg-[color-mix(in_srgb,var(--chip)_28%,transparent)]',
                !isConceptRelation(chip.relationship) && chip.relationship !== ALL_RELATIONS && !active && 'text-[var(--ws-ink-soft)]'
              )}
            >
              {chip.label}
              <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-[var(--ws-ink-faint)]')}>{chip.count}</span>
            </button>
          );
        })}
      </div>
      {rebuildError && !isRebuilding && (
        <p className="mt-2 text-[11.5px] text-[var(--ws-danger)]" role="alert">
          {rebuildError}
        </p>
      )}
    </div>
  );
}
