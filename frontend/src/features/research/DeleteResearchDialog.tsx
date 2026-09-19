import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle, Loader2, BrainCircuit } from 'lucide-react';
import { researchApi, ResearchSession } from '@/api/research';
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

interface DeleteResearchDialogProps {
  workspaceId: string;
  session: ResearchSession | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DeleteResearchDialog({
  workspaceId,
  session,
  open,
  onClose,
  onSuccess,
}: DeleteResearchDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => researchApi.deleteSession(workspaceId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setErrorMessage(null);
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete research session. Please try again.';
      setErrorMessage(msg);
    },
  });

  const handleClose = () => {
    if (deleteMutation.isPending) return;
    setErrorMessage(null);
    onClose();
  };

  const handleConfirmDelete = () => {
    if (!session) return;
    deleteMutation.mutate(session.id);
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-[#17171C] border-[#27272A] shadow-2xl rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          {/* Danger icon badge */}
          <div className="w-12 h-12 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center text-[#EF4444] mb-3 shadow-[0_0_16px_rgba(239,68,68,0.15)]">
            <Trash2 size={22} className="stroke-[2.2]" />
          </div>

          <DialogTitle className="text-xl font-bold tracking-tight text-[#F4F4F5]">
            Delete Research Session
          </DialogTitle>

          <DialogDescription className="text-sm text-[#A1A1AA] leading-relaxed mt-1">
            Are you sure you want to permanently delete this research investigation?
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 space-y-3">
          {/* Session details card */}
          <div className="p-3.5 rounded-xl bg-[#111114] border border-[#27272A] space-y-2.5">
            <div className="flex items-start gap-2.5">
              <BrainCircuit size={17} className="text-[#818CF8] shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-[#F4F4F5] line-clamp-3 leading-snug break-words">
                &ldquo;{session.question}&rdquo;
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-[#27272A]/70">
              <Badge variant="default" className="text-[11px] capitalize px-2 py-0.5">
                Depth: {session.research_depth}
              </Badge>
              <Badge variant="default" className="text-[11px] capitalize px-2 py-0.5">
                Status: {session.status}
              </Badge>
            </div>
          </div>

          {/* Warning context */}
          <div className="p-3 rounded-xl bg-[#EF4444]/5 border border-[#EF4444]/20 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-[#F59E0B] shrink-0 mt-0.5" />
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              <span className="font-medium text-[#F4F4F5]">This action cannot be undone.</span> All
              gathered evidence, task executions, and generated synthesis reports will be permanently erased.
            </p>
          </div>

          {/* Error notice if mutation failed */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444] flex items-start gap-2 animate-in fade-in-50">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-5 mt-2 bg-[#141418]/60 border-t border-[#27272A]/80 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={deleteMutation.isPending}
            className="rounded-xl border-[#27272A] bg-transparent text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1C1C22] px-4 transition-all"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white px-5 font-medium shadow-[0_4px_16px_rgba(239,68,68,0.25)] hover:shadow-[0_4px_24px_rgba(239,68,68,0.4)] transition-all flex items-center gap-2"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>Delete Research</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
