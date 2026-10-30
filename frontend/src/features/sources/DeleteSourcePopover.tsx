import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle, Loader2, Globe } from '@/components/icons';
import { sourcesApi, Source } from '@/api/sources';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getServerErrorMessage } from '@/lib/apiError';

interface DeleteSourcePopoverProps {
  source: Source | null;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function DeleteSourcePopover({
  source,
  children,
  side = 'bottom',
  align = 'end',
  sideOffset = 6,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: DeleteSourcePopoverProps) {
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
    mutationFn: (sourceId: string) => sourcesApi.deleteSource(sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setErrorMessage(null);
      onSuccess?.();
      handleOpenChange(false);
    },
    onError: (err) => {
      const msg =
        getServerErrorMessage(err) ||
        err.message ||
        'Failed to delete source. Please try again.';
      setErrorMessage(msg);
    },
  });

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!source) return;
    deleteMutation.mutate(source.id);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleOpenChange(false);
  };

  if (!source) {
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
        className="w-[320px] sm:w-[350px] p-0 overflow-hidden bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] rounded-2xl sm:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
              <Trash2 size={16} className="stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-[#F4F4F5] leading-tight">
                Delete Source
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] leading-normal mt-0.5">
                Permanently delete this knowledge source?
              </p>
            </div>
          </div>

          {/* Source details card */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-1.5">
            <div className="flex items-start gap-2">
              <Globe size={13} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-slate-900 dark:text-[#F4F4F5] line-clamp-2 leading-snug break-words">
                {source.title}
              </p>
            </div>

            <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200 dark:border-[#27272a]/60">
              <Badge variant="default" className="text-[9px] capitalize px-2 py-0.5 rounded-full">
                Type: {source.source_type}
              </Badge>
              <Badge variant="default" className="text-[9px] capitalize px-2 py-0.5 rounded-full">
                Status: {source.status}
              </Badge>
            </div>
          </div>

          {/* Warning context */}
          <div className="p-3 rounded-xl bg-red-50 dark:bg-[#201010] border border-red-200 dark:border-[#501a1a] flex items-start gap-2">
            <AlertTriangle size={13} className="text-red-600 dark:text-[#EF4444] shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-700 dark:text-[#A1A1AA] leading-relaxed">
              <span className="font-medium text-slate-900 dark:text-[#F4F4F5]">Action cannot be undone.</span> Indexed
              chunks and embeddings will be removed from retrieval.
            </p>
          </div>

          {/* Error notice if mutation failed */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-[#301010] border border-red-300 dark:border-red-700/60 text-[11px] text-red-600 dark:text-[#EF4444] flex items-start gap-1.5">
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
            className="ui-press rounded-full border-slate-200 dark:border-[#27272a] bg-transparent text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#F4F4F5] hover:bg-slate-100 dark:hover:bg-[#202024] px-3.5 h-7 text-xs cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="ui-press rounded-full bg-red-600 hover:bg-red-700 text-white px-3.5 h-7 text-xs font-medium cursor-pointer flex items-center gap-1.5"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={12} />
                <span>Delete Source</span>
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
