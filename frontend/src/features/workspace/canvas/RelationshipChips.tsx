import type { ReactNode } from 'react';
import { ChevronDown, Loader2, MoreHorizontal, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ALL_RELATIONS, SHARED_VIEW, relationLabel, type RelationCount, type RelationFilter } from './graphView';

interface RelationshipChipsProps {
  counts: { all: number; types: RelationCount[] };
  /** Concepts two or more of the scope's sources share; without any there's no Shared button. */
  sharedCount?: number;
  value: RelationFilter;
  onChange: (filter: RelationFilter) => void;
  /** Other map controls, at the start of the bar. */
  leading?: ReactNode;
  onRebuild?: () => void;
  isRebuilding?: boolean;
  rebuildError?: string | null;
  className?: string;
}

const SEGMENT =
  'ui-press flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] transition-colors duration-150';
const SEGMENT_ON = 'bg-[var(--ws-card-hover)] font-medium text-[var(--ws-ink)] ring-1 ring-inset ring-[var(--ws-line)]';
const SEGMENT_OFF = 'font-normal text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)]';

/** The relation types picked in the menu; '*' and Shared pick none. */
function pickedTypes(value: RelationFilter): ReadonlySet<string> {
  if (typeof value !== 'string') return value;
  return value === ALL_RELATIONS || value === SHARED_VIEW ? new Set() : new Set([value]);
}

/**
 * Picks what the map shows: All of it, what the sources share (when there's more than one), or any mix of relation
 * types from one menu. Rebuilding the map sits in the overflow menu at the end.
 */
export default function RelationshipChips({
  counts,
  sharedCount = 0,
  value,
  onChange,
  leading,
  onRebuild,
  isRebuilding = false,
  rebuildError = null,
  className,
}: RelationshipChipsProps) {
  const picked = pickedTypes(value);
  const toggle = (relationship: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(relationship);
    else next.delete(relationship);
    onChange(next.size === 0 ? ALL_RELATIONS : next);
  };
  const relationsLabel =
    picked.size === 0 ? 'Relations' : picked.size === 1 ? relationLabel([...picked][0]!) : `${picked.size} relations`;

  return (
    <div className={cn('pointer-events-auto flex min-w-0 flex-col items-center gap-1.5', className)}>
      {rebuildError && !isRebuilding && (
        <p className="on-space text-[12px] text-[var(--ws-danger)]" role="alert">
          {rebuildError}
        </p>
      )}
      <div className="flex min-h-11 w-fit max-w-full items-center gap-1 rounded-xl border border-[var(--ws-line)] glass px-1.5 py-1">
        {leading}
        <div role="group" aria-label="What the map shows" className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            aria-pressed={value === ALL_RELATIONS}
            title="Every relationship between concepts"
            onClick={() => onChange(ALL_RELATIONS)}
            className={cn(SEGMENT, value === ALL_RELATIONS ? SEGMENT_ON : SEGMENT_OFF)}
          >
            All
            <span className="tabular-nums text-[var(--ws-ink-soft)]">{counts.all}</span>
          </button>
          {sharedCount > 0 && (
            <button
              type="button"
              aria-pressed={value === SHARED_VIEW}
              title="Only the concepts more than one source mentions"
              onClick={() => onChange(SHARED_VIEW)}
              className={cn(SEGMENT, value === SHARED_VIEW ? SEGMENT_ON : SEGMENT_OFF)}
            >
              Shared
              <span className="tabular-nums text-[var(--ws-ink-soft)]">{sharedCount}</span>
            </button>
          )}
          {counts.types.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={picked.size > 0 ? `Relations: ${[...picked].map(relationLabel).join(', ')}` : 'Filter by relation'}
                  className={cn(SEGMENT, 'group max-w-[200px]', picked.size > 0 ? SEGMENT_ON : SEGMENT_OFF)}
                >
                  <span className="min-w-0 truncate">{relationsLabel}</span>
                  <ChevronDown size={13} aria-hidden className="shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" sideOffset={10} className="font-ui max-h-[min(360px,60vh)] min-w-[220px] overflow-y-auto">
                <DropdownMenuLabel className="text-[12px] font-normal text-[var(--ws-ink-soft)]">Show relations</DropdownMenuLabel>
                {counts.types.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.relationship}
                    checked={picked.has(t.relationship)}
                    onCheckedChange={(on) => toggle(t.relationship, on === true)}
                    className="py-2 text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate">{relationLabel(t.relationship)}</span>
                    <span className="tabular-nums text-[var(--ws-ink-soft)]">{t.count}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                {picked.size > 0 && (
                  <>
                    <DropdownMenuSeparator className="my-1 bg-[var(--ws-line)]" />
                    <DropdownMenuItem onSelect={() => onChange(ALL_RELATIONS)} className="py-2 text-[13px]">
                      Show all relations
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {onRebuild && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={isRebuilding ? 'More map options, rebuilding the map' : 'More map options'}
                title="More"
                className="ui-press grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--ws-ink-soft)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] data-[state=open]:bg-[var(--ws-card-hover)]"
              >
                {isRebuilding ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <MoreHorizontal size={16} aria-hidden />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={10} className="font-ui min-w-[220px]">
              <DropdownMenuItem onSelect={onRebuild} disabled={isRebuilding} className="gap-2.5 py-2 text-[13px]">
                <RefreshCw size={14} aria-hidden className={cn(isRebuilding && 'animate-spin')} />
                <span className="flex flex-col">
                  {isRebuilding ? 'Rebuilding the map…' : 'Rebuild map'}
                  <span className="text-[12px] text-[var(--ws-ink-soft)]">Re-read sources for missing links</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
