import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle, Loader2, Globe } from '@/components/icons';
import { sourcesApi, Source } from '@/api/sources';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getServerErrorMessage } from '@/lib/apiError';

interface DeleteSourceDialogProps {
  source: Source | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DeleteSourceDialog({
  source,
  open,
  onClose,
  onSuccess,
}: DeleteSourceDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (sourceId: string) => sourcesApi.deleteSource(sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setErrorMessage(null);
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const msg =
        getServerErrorMessage(err) ||
        err.message ||
        'Failed to delete source. Please try again.';
      setErrorMessage(msg);
    },
  });

  const handleClose = () => {
    if (deleteMutation.isPending) return;
    setErrorMessage(null);
    onClose();
  };

  const handleConfirmDelete = () => {
    if (!source) return;
    deleteMutation.mutate(source.id);
  };

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-[0_16px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.9)]">
        <DialogHeader className="px-6 pt-6 pb-2">
          {/* Danger icon badge */}
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-3">
            <Trash2 size={20} className="stroke-[2.2]" />
          </div>

          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900 dark:text-[#F4F4F5]">
            Delete Source
          </DialogTitle>

          <DialogDescription className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mt-1">
            Are you sure you want to permanently delete this knowledge source?
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 space-y-3">
          {/* Source details card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2">
            <div className="flex items-start gap-2.5">
              <Globe size={15} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-slate-900 dark:text-[#F4F4F5] line-clamp-2 leading-snug break-words">
                {source.title}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-[#27272a]">
              <Badge variant="default" className="text-[10px] capitalize px-2.5 py-0.5 rounded-full">
                Type: {source.source_type}
              </Badge>
              <Badge variant="default" className="text-[10px] capitalize px-2.5 py-0.5 rounded-full">
                Status: {source.status}
              </Badge>
            </div>
          </div>

          {/* Warning context */}
          <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-[#201010] border border-red-200 dark:border-[#501a1a] flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-red-600 dark:text-[#EF4444] shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 dark:text-[#A1A1AA] leading-relaxed">
              <span className="font-medium text-slate-900 dark:text-[#F4F4F5]">This action cannot be undone.</span> All
              indexed chunks and vector embeddings associated with this source will be removed from retrieval.
            </p>
          </div>

          {/* Error notice if mutation failed */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-[#301010] border border-red-300 dark:border-red-700/60 text-xs text-red-600 dark:text-[#EF4444] flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 mt-2 bg-slate-50 dark:bg-[#121214] border-t border-slate-200 dark:border-[#27272a] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={deleteMutation.isPending}
            className="rounded-full border-slate-200 dark:border-[#27272a] bg-transparent text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-[#F4F4F5] hover:bg-slate-100 dark:hover:bg-[#202024] px-4 text-xs transition-colors"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="rounded-full bg-red-600 hover:bg-red-700 text-white px-4 text-xs font-medium transition-colors flex items-center gap-2"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={14} />
                <span>Delete Source</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { default as DeleteSourcePopover } from './DeleteSourcePopover';
