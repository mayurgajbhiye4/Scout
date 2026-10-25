import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CopilotStatus } from './useResearchChat';

const STATUS_COPY: Record<CopilotStatus, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  streaming: 'Writing',
};

interface CopilotTogglePillProps {
  visible: boolean;
  status: CopilotStatus;
  sessionTitle: string | null;
  onOpen: () => void;
}

export default function CopilotTogglePill({ visible, status, sessionTitle, onOpen }: CopilotTogglePillProps) {
  const busy = status !== 'idle';
  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      aria-label={`Open Research Copilot, ${STATUS_COPY[status].toLowerCase()}`}
      className={cn(
        'font-ui ws-motion ws-ease absolute bottom-4 right-4 z-20 flex h-11 items-center gap-2.5 rounded-2xl border border-[var(--ws-line)] bg-[var(--ws-glass)] pl-3 pr-2 text-[13px] text-[var(--ws-ink)] shadow-[var(--ws-shadow)] backdrop-blur-md',
        'transition-[transform,opacity] duration-200 hover:border-[var(--ws-accent)]/60 cursor-pointer',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      )}
    >
      <Sparkles size={16} className="text-[var(--ws-accent-ink)]" />
      <span className="font-semibold">Copilot</span>
      {sessionTitle && <span className="hidden max-w-[160px] truncate text-[var(--ws-ink-soft)] md:inline">{sessionTitle}</span>}
      <span
        className={cn(
          'flex items-center gap-1.5 rounded-[9px] px-2 py-0.5 text-[12px] font-medium',
          busy ? 'bg-[var(--ws-accent-wash)] text-[var(--ws-accent-ink)]' : 'bg-[var(--ws-card-hover)] text-[var(--ws-ink-soft)]'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', busy ? 'animate-pulse bg-[var(--ws-accent)]' : 'bg-[var(--ws-ink-faint)]')} />
        {STATUS_COPY[status]}
      </span>
      <kbd className="hidden rounded-[6px] border border-[var(--ws-line)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ws-ink-faint)] sm:inline">
        ⌘J
      </kbd>
    </button>
  );
}
