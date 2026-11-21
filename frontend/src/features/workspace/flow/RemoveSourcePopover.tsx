import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { sessionsApi } from '@/api/sessions';
import { withoutSource } from '../useWorkspaceData';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getServerErrorMessage } from '@/lib/apiError';

const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ws-dock)]';

/**
 * Confirms taking a source out of a session: one question, then Cancel or Remove. The source only leaves this
 * session; it stays in the library and in any other session that uses it.
 */
export default function RemoveSourcePopover({
  sessionId,
  sourceId,
  title,
  open,
  onOpenChange,
  onRemoved,
  children,
}: {
  sessionId: string;
  sourceId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: (sourceId: string) => void;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => sessionsApi.detachSource(sessionId, sourceId),
    onSuccess: () => {
      // Drop the row at once rather than waiting for the refetch, then let the server confirm
      queryClient.setQueriesData({ queryKey: ['session-sources', sessionId] }, (old: unknown) => withoutSource(old, sourceId));
      void queryClient.invalidateQueries({ queryKey: ['session-sources', sessionId] });
      // The sessions list shows each session's source count
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setError(null);
      onRemoved(sourceId);
      onOpenChange(false);
    },
    onError: (err) => setError(getServerErrorMessage(err) || "Couldn't remove the source. Try again."),
  });

  const handleOpenChange = (next: boolean) => {
    if (!next && remove.isPending) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className="font-ui w-[min(300px,calc(100vw-1.5rem))] rounded-4xl glass-strong p-5 text-left text-[var(--ws-ink)] dark:border-[var(--ws-line)] dark:text-[var(--ws-ink)] dark:shadow-[var(--ws-shadow)]"
      >
        <p className="text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">Remove “{title}” from this session?</p>
        <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--ws-ink-soft)]">
          It stays in your library and in any other session that uses it.
        </p>

        {error && (
          <p role="alert" className="mt-2 text-[12.5px] leading-snug text-[var(--ws-danger)]">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={remove.isPending}
            className={`ui-press h-9 rounded-lg border border-[var(--ws-line)] text-[13px] font-medium text-[var(--ws-ink-soft)] hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:opacity-60 cursor-pointer ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className={`ui-press flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--ws-danger)]/10 text-[13px] font-semibold text-[var(--ws-danger)] ring-1 ring-[var(--ws-danger)]/25 hover:bg-[var(--ws-danger)]/15 hover:ring-[var(--ws-danger)]/40 disabled:cursor-wait cursor-pointer ${FOCUS_RING}`}
          >
            {remove.isPending && <Loader2 size={13} className="animate-spin" />}
            Remove
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
