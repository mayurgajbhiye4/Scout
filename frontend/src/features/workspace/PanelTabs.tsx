import { cn } from '@/lib/utils';
import { LEFT_PANEL_TABS, type LeftPanelTab } from './floatingWindows';

const LABEL: Record<LeftPanelTab, string> = { sessions: 'Sessions', sources: 'Sources' };

interface PanelTabsProps {
  value: LeftPanelTab;
  onChange: (tab: LeftPanelTab) => void;
  /** Shown after each label; omitted while it's still loading. A '+' marks a count with more pages to come. */
  counts: Partial<Record<LeftPanelTab, number | string>>;
}

/**
 * The title of the left-hand window: sessions and sources share it, one at a time, and this switches between them.
 * Each panel renders it in place of its own heading, beside its own actions.
 */
export default function PanelTabs({ value, onChange, counts }: PanelTabsProps) {
  return (
    <div role="tablist" aria-label="Library" className="flex shrink-0 rounded-full bg-[var(--ws-canvas)] p-0.5 ring-1 ring-[var(--ws-line)]">
      {LEFT_PANEL_TABS.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={cn(
              'ui-press flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold tracking-tight transition-colors cursor-pointer',
              active
                ? 'bg-[var(--ws-card-hover)] text-[var(--ws-ink)] ring-1 ring-[var(--ws-line)]'
                : 'text-[var(--ws-ink-faint)] hover:text-[var(--ws-ink)]'
            )}
          >
            {LABEL[tab]}
            {counts[tab] !== undefined && <span className="text-[12px] font-normal tabular-nums opacity-70">{counts[tab]}</span>}
          </button>
        );
      })}
    </div>
  );
}
