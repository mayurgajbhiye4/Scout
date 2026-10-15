import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle, Loader2, Globe } from 'lucide-react';
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
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
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
      <DialogContent className="max-w-md p-0 overflow-hidden bg-[#141416] border-[#27272a] rounded-none">
        <DialogHeader className="px-6 pt-6 pb-2">
          {/* Danger icon badge */}
          <div className="w-10 h-10 rounded-none bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-center text-[#EF4444] mb-3">
            <Trash2 size={20} className="stroke-[2.2]" />
          </div>

          <DialogTitle className="text-lg font-bold tracking-tight text-[#F4F4F5]">
            Delete Source
          </DialogTitle>

          <DialogDescription className="text-xs text-[#A1A1AA] leading-relaxed mt-1">
            Are you sure you want to permanently delete this knowledge source?
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 space-y-3">
          {/* Source details card */}
          <div className="p-3.5 rounded-none bg-[#18181b] border border-[#27272a] space-y-2">
            <div className="flex items-start gap-2.5">
              <Globe size={15} className="text-[#3b82f6] shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-[#F4F4F5] line-clamp-2 leading-snug break-words">
                {source.title}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-[#27272a]">
              <Badge variant="default" className="text-[10px] capitalize px-2 py-0.5">
                Type: {source.source_type}
              </Badge>
              <Badge variant="default" className="text-[10px] capitalize px-2 py-0.5">
                Status: {source.status}
              </Badge>
            </div>
          </div>

          {/* Warning context */}
          <div className="p-3 rounded-none bg-[#201010] border border-[#501a1a] flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-[#F59E0B] shrink-0 mt-0.5" />
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              <span className="font-medium text-[#F4F4F5]">This action cannot be undone.</span> All
              indexed chunks and vector embeddings associated with this source will be removed from retrieval.
            </p>
          </div>

          {/* Error notice if mutation failed */}
          {errorMessage && (
            <div className="p-3 rounded-none bg-[#301010] border border-red-700/60 text-xs text-[#EF4444] flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 mt-2 bg-[#121214] border-t border-[#27272a] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={deleteMutation.isPending}
            className="rounded-none border-[#27272a] bg-transparent text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#202024] px-4 text-xs transition-colors"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="rounded-none bg-[#EF4444] hover:bg-[#DC2626] text-white px-4 text-xs font-medium transition-colors flex items-center gap-2"
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
