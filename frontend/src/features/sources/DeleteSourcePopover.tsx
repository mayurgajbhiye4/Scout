import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle, Loader2, Globe } from '@/components/icons';
import { sourcesApi, Source } from '@/api/sources';
import { soundEffects } from '@/lib/soundEffects';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
      soundEffects.playDelete();
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setErrorMessage(null);
      onSuccess?.();
      handleOpenChange(false);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
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
        className="w-[320px] sm:w-[350px] p-0 overflow-hidden bg-[#141416] border-[#27272a] rounded-none shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-none bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-center text-[#EF4444] shrink-0">
              <Trash2 size={16} className="stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-[#F4F4F5] leading-tight">
                Delete Source
              </h4>
              <p className="text-[11px] text-[#A1A1AA] leading-normal mt-0.5">
                Permanently delete this knowledge source?
              </p>
            </div>
          </div>

          {/* Source details card */}
          <div className="p-2.5 rounded-none bg-[#18181b] border border-[#27272a] space-y-1.5">
            <div className="flex items-start gap-2">
              <Globe size={13} className="text-[#3b82f6] shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-[#F4F4F5] line-clamp-2 leading-snug break-words">
                {source.title}
              </p>
            </div>

            <div className="flex items-center gap-1.5 pt-1 border-t border-[#27272a]/60">
              <Badge variant="default" className="text-[9px] capitalize px-1.5 py-0.2">
                Type: {source.source_type}
              </Badge>
              <Badge variant="default" className="text-[9px] capitalize px-1.5 py-0.2">
                Status: {source.status}
              </Badge>
            </div>
          </div>

          {/* Warning context */}
          <div className="p-2.5 rounded-none bg-[#201010] border border-[#501a1a] flex items-start gap-2">
            <AlertTriangle size={13} className="text-[#F59E0B] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
              <span className="font-medium text-[#F4F4F5]">Action cannot be undone.</span> Indexed
              chunks and embeddings will be removed from retrieval.
            </p>
          </div>

          {/* Error notice if mutation failed */}
          {errorMessage && (
            <div className="p-2 rounded-none bg-[#301010] border border-red-700/60 text-[11px] text-[#EF4444] flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 py-2.5 bg-[#121214] border-t border-[#27272a] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={deleteMutation.isPending}
            className="rounded-none border-[#27272a] bg-transparent text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#202024] px-3 h-7 text-xs cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="rounded-none bg-[#EF4444] hover:bg-[#DC2626] text-white px-3 h-7 text-xs font-medium cursor-pointer flex items-center gap-1.5"
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
