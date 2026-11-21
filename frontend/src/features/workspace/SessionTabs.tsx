import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Loader2, Plus, SquarePen, X } from 'lucide-react';
import { formatSessionTitle } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { FLOATING_BAR, IconButton } from './FloatingBar';
import type { SessionTab } from './openTabs';

const NEW_TAB_ID = 'session-tab-new';

interface SessionTabsProps {
  tabs: SessionTab[];
  /** The open session; null while a new conversation, which has no session yet, is up. */
  activeId: string | null;
  /** The open session's reply is still coming in. */
  busy?: boolean;
  onSelect: (tab: SessionTab) => void;
  /** Closes the tab; the session itself stays in the history. */
  onClose: (id: string) => void;
  onNew: () => void;
}

const tabTitle = (tab: SessionTab) => (tab.title ? formatSessionTitle(tab.title) : 'Research session');

/**
 * The sessions kept open, as tabs in the top bar between its two pills. A new conversation shows as a tab of its own
 * at the end until its first message makes it a session. Arrow keys move between tabs, Enter opens one, Delete closes it.
 */
export default function SessionTabs({ tabs, activeId, busy = false, onSelect, onClose, onNew }: SessionTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the open tab in view when the strip is scrolled, or when it was opened from the history or the palette
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeId, tabs.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    let target: number | null = null;
    if (e.key === 'ArrowRight') target = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') target = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = items.length - 1;
    else if (e.key === 'Delete') {
      const id = items[index]?.dataset.sessionId;
      if (!id) return;
      e.preventDefault();
      onClose(id);
      // Focus lands on whichever tab took the closed one's place
      requestAnimationFrame(() => {
        const left = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
        left[Math.min(index, left.length - 1)]?.focus();
      });
      return;
    }
    if (target === null) return;
    e.preventDefault();
    items[target]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-1 justify-start">
      <div className={cn(FLOATING_BAR, 'ui-in-up min-w-0')}>
        <div
          ref={listRef}
          role="tablist"
          aria-label="Open sessions"
          onKeyDown={onKeyDown}
          className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            const title = tabTitle(tab);
            return (
              <div
                key={tab.id}
                role="presentation"
                className={cn(
                  'ui-in-up group relative flex h-9 w-[168px] min-w-[104px] shrink items-center rounded-lg transition-colors',
                  active
                    ? 'bg-[var(--ws-card-hover)] ring-1 ring-inset ring-[var(--ws-line)]'
                    : 'hover:bg-[var(--ws-card-hover)] focus-within:bg-[var(--ws-card-hover)]'
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-keyshortcuts="Delete"
                  tabIndex={active ? 0 : -1}
                  data-session-id={tab.id}
                  title={title}
                  onClick={() => !active && onSelect(tab)}
                  onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                  onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
                  className={cn(
                    'flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-lg pl-3 pr-8 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)] cursor-pointer',
                    active ? 'font-medium text-[var(--ws-ink)]' : 'font-normal text-[var(--ws-ink-soft)] group-hover:text-[var(--ws-ink)]'
                  )}
                >
                  {active && busy && <Loader2 size={12} className="shrink-0 animate-spin text-[var(--ws-accent-ink)]" aria-hidden />}
                  <span className="truncate">{title}</span>
                  {active && busy && <span className="sr-only">, answering</span>}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onClose(tab.id)}
                  aria-label={`Close ${title}`}
                  title="Close tab"
                  className={cn(
                    'ui-press absolute right-1.5 grid h-6 w-6 place-items-center rounded-full text-[var(--ws-ink-faint)] hover:bg-[var(--ws-card)] hover:text-[var(--ws-ink)] cursor-pointer',
                    !active && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                  )}
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
            );
          })}
          {activeId === null && (
            <button
              type="button"
              role="tab"
              id={NEW_TAB_ID}
              aria-selected
              tabIndex={0}
              className="ui-in-up flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--ws-card-hover)] px-3 text-[13px] font-medium text-[var(--ws-ink)] outline-none ring-1 ring-inset ring-[var(--ws-line)] focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)]"
            >
              <SquarePen size={14} className="shrink-0 text-[var(--ws-ink-soft)]" aria-hidden />
              <span className="truncate">New research</span>
            </button>
          )}
        </div>
        {activeId !== null && (
          <IconButton label="New research (Ctrl/⌘ N)" onClick={onNew}>
            <Plus size={16} aria-hidden />
          </IconButton>
        )}
      </div>
    </div>
  );
}
