import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle, Loader2, MessageSquare } from '@/components/icons';
import { sessionsApi, Session } from '@/api/sessions';
import { formatSessionTitle } from '@/lib/formatters';
import { soundEffects } from '@/lib/soundEffects';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    if (!nextOpen) {
      setErrorMessage(null);
    }
    if (isControlled) {
      setControlledOpen?.(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => sessionsApi.deleteSession(sessionId),
    onSuccess: () => {
      soundEffects.playDelete();
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setErrorMessage(null);
      onSuccess?.();
      handleOpenChange(false);
    },
    onError: (err) => {
      const msg =
        getServerErrorMessage(err) ||
        err.message ||
        'Failed to delete research session. Please try again.';
      setErrorMessage(msg);
    },
  });

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) return;
    deleteMutation.mutate(session.id);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleOpenChange(false);
  };

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
        className="w-[calc(100vw-2rem)] sm:w-[350px] max-w-[350px] p-0 overflow-hidden bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] rounded-[28px] sm:rounded-[32px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
              <Trash2 size={16} className="stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-[#F4F4F5] leading-tight">
                Delete Research Session
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] leading-normal mt-0.5">
                Permanently delete this research conversation?
              </p>
            </div>
          </div>

          {/* Session details card */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-1.5">
            <div className="flex items-start gap-2">
              <MessageSquare size={13} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-slate-900 dark:text-[#F4F4F5] line-clamp-2 leading-snug break-words">
                {formatSessionTitle(session.title)}
              </p>
            </div>

            <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200 dark:border-[#27272a]/60">
              <Badge variant="default" className="text-[9px] capitalize px-2 py-0.5 rounded-full">
                {session.status}
              </Badge>
            </div>
          </div>

          {/* Warning context */}
          <div className="p-3 rounded-2xl bg-red-50 dark:bg-[#201010] border border-red-200 dark:border-[#501a1a] flex items-start gap-2">
            <AlertTriangle size={13} className="text-red-600 dark:text-[#EF4444] shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-700 dark:text-[#A1A1AA] leading-relaxed">
              <span className="font-medium text-slate-900 dark:text-[#F4F4F5]">Action cannot be undone.</span> All chat
              history and synthesis will be permanently removed.
            </p>
          </div>

          {/* Error notice if mutation failed */}
          {errorMessage && (
            <div className="p-2.5 rounded-2xl bg-red-50 dark:bg-[#301010] border border-red-300 dark:border-red-700/60 text-[11px] text-red-600 dark:text-[#EF4444] flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-[#121214] border-t border-slate-200 dark:border-[#27272a] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={deleteMutation.isPending}
            className="rounded-full border-slate-200 dark:border-[#27272a] bg-transparent text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#F4F4F5] hover:bg-slate-100 dark:hover:bg-[#202024] px-3.5 h-7 text-xs cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="rounded-full bg-red-600 hover:bg-red-700 text-white px-3.5 h-7 text-xs font-medium cursor-pointer flex items-center gap-1.5"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={12} />
                <span>Delete Session</span>
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
