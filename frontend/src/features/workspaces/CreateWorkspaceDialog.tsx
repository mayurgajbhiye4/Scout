import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi, WorkspaceCreateSchema, WorkspaceCreateData } from '@/api/workspaces';

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
    defaultValues: {
      name: '',
      description: '',
    }
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
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Create Workspace</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <TextField
              label="Workspace Name"
              fullWidth
              autoFocus
              {...register('name')}
              error={!!errors.name}
              helperText={errors.name?.message}
            />
            <TextField
              label="Description (Optional)"
              fullWidth
              multiline
              rows={3}
              {...register('description')}
              error={!!errors.description}
              helperText={errors.description?.message}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} color="inherit" disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button sx={{color: 'black'}} type="submit" variant="contained" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
