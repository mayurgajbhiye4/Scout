
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, SourceCreateSchema, SourceCreateData } from '@/api/sources';
import { Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddSourceDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddSourceDialog({ open, onClose }: AddSourceDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SourceCreateData>({
    resolver: zodResolver(SourceCreateSchema),
    defaultValues: { url: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: SourceCreateData) => sourcesApi.createSource(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      handleClose();
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = (data: SourceCreateData) => {
    createMutation.mutate(data);
  };

  const isPending = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Knowledge Source</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 min-h-[140px]">
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Enter the URL of a web page, article, or documentation to be ingested by the AI.
              </p>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">URL</label>
                <div className="relative">
                  <div className="absolute left-3 top-2.5 text-muted-foreground">
                    <LinkIcon size={16} />
                  </div>
                  <Input
                    autoFocus
                    placeholder="https://example.com/article"
                    {...register('url')}
                    className={`pl-9 ${errors.url ? 'border-destructive' : ''}`}
                  />
                </div>
                {errors.url && (
                  <p className="text-xs text-destructive mt-1">{errors.url.message}</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
            >
              {isPending ? 'Processing...' : 'Add Source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
