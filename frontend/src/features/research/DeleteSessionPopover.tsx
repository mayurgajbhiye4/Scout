import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@/components/icons';
import { sessionsApi, Session } from '@/api/sessions';
import { formatSessionTitle } from '@/lib/formatters';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { getServerErrorMessage } from '@/lib/apiError';

interface DeleteSessionPopoverProps {
  session: Session | null;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ws-dock)]';

/**
 * Confirms deleting a session: one question, then Cancel or Delete. Drawn in the workspace's own tokens, like the
 * account popover, since it opens over the workspace (in a portal, so it sets `font-ui` itself).
 */
export default function DeleteSessionPopover({
  session,
  children,
  side = 'bottom',
  align = 'end',
  sideOffset = 6,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: DeleteSessionPopoverProps) {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && deleteMutation.isPending) return;
    if (!nextOpen) setErrorMessage(null);
    if (isControlled) setControlledOpen?.(nextOpen);
    else setInternalOpen(nextOpen);
  };

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => sessionsApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setErrorMessage(null);
      onSuccess?.();
      handleOpenChange(false);
    },
    onError: (err) => {
      setErrorMessage(getServerErrorMessage(err) || "Couldn't delete the session. Try again.");
    },
  });

  if (!session) {
    return <>{children}</>;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        onClick={(e) => e.stopPropagation()}
        className="font-ui w-[min(300px,calc(100vw-1.5rem))] rounded-4xl glass-strong p-5 text-left text-[var(--ws-ink)] dark:border-[var(--ws-line)] dark:text-[var(--ws-ink)] dark:shadow-[var(--ws-shadow)]"
      >
        <p className="text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">
          Delete “{formatSessionTitle(session.title)}”?
        </p>

        {errorMessage && (
          <p role="alert" className="mt-2 text-[12.5px] leading-snug text-[var(--ws-danger)]">
            {errorMessage}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChange(false);
            }}
            disabled={deleteMutation.isPending}
            className={`ui-press h-9 rounded-full border border-[var(--ws-line)] text-[13px] font-medium text-[var(--ws-ink-soft)] hover:border-[var(--ws-line-strong)] hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink)] disabled:opacity-60 cursor-pointer ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteMutation.mutate(session.id);
            }}
            disabled={deleteMutation.isPending}
            className={`ui-press flex h-9 items-center justify-center gap-1.5 rounded-full bg-[var(--ws-danger)]/10 text-[13px] font-semibold text-[var(--ws-danger)] ring-1 ring-[var(--ws-danger)]/25 hover:bg-[var(--ws-danger)]/15 hover:ring-[var(--ws-danger)]/40 disabled:cursor-wait cursor-pointer ${FOCUS_RING}`}
          >
            {deleteMutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Delete
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
