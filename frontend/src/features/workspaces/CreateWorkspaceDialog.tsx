import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi, WorkspaceCreateSchema, WorkspaceCreateData } from '@/api/workspaces';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateWorkspaceDialog({ open, onClose }: CreateWorkspaceDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkspaceCreateData>({
    resolver: zodResolver(WorkspaceCreateSchema),
    defaultValues: { name: '', description: '' },
  });

  const createMutation = useMutation({
    mutationFn: workspacesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      handleClose();
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = (data: WorkspaceCreateData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 pb-2 flex flex-col gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Workspace Name</label>
              <Input
                autoFocus
                {...register('name')}
                placeholder="My Research Workspace"
                className={errors.name ? 'border-[#EF4444]' : ''}
              />
              {errors.name && (
                <p className="text-xs text-[#EF4444] mt-1">{errors.name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Description (Optional)</label>
              <Textarea
                {...register('description')}
                placeholder="What will this workspace be used for?"
                className={errors.description ? 'border-[#EF4444]' : ''}
              />
              {errors.description && (
                <p className="text-xs text-[#EF4444] mt-1">{errors.description.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
