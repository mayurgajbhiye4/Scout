import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Tabs, Tab, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, DocumentCreateSchema, DocumentCreateData } from '@/api/sources';
import { Link as LinkIcon, FileText } from 'lucide-react';

interface AddSourceDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}

export default function AddSourceDialog({ open, onClose, workspaceId }: AddSourceDialogProps) {
  const [tab, setTab] = useState(0);
  const queryClient = useQueryClient();
  
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<DocumentCreateData>({
    resolver: zodResolver(DocumentCreateSchema),
    defaultValues: {
      source_type: 'url',
      url: '',
      filename: '',
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: DocumentCreateData) => sourcesApi.createDocument(workspaceId, data),
    onSuccess: () => {
      // Invalidate both documents and sources
      queryClient.invalidateQueries({ queryKey: ['sources', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId] });
      handleClose();
    },
  });

  const handleClose = () => {
    reset();
    setTab(0);
    onClose();
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
    setValue('source_type', newValue === 0 ? 'url' : 'file');
    setValue('url', '');
    setValue('filename', '');
  };

  const onSubmit = (data: DocumentCreateData) => {
    if (tab === 1) {
      // For MVP file upload, we'll just mock it as a text submission or URL for now
      // The real implementation would use FormData and a file input
      alert('File upload is a placeholder for MVP. Please use the Web URL option.');
      return;
    }
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Add Knowledge Source</DialogTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3, pt: 1 }}>
        <Tabs value={tab} onChange={handleTabChange} aria-label="source type tabs">
          <Tab icon={<LinkIcon size={16} />} iconPosition="start" label="Web URL" />
          <Tab icon={<FileText size={16} />} iconPosition="start" label="Document Upload" />
        </Tabs>
      </Box>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ pt: 4, minHeight: 150 }}>
          {tab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Enter the URL of a web page, article, or documentation to be ingested by the AI.
              </Typography>
              <TextField
                label="URL"
                fullWidth
                autoFocus
                placeholder="https://example.com/article"
                {...register('url')}
                error={!!errors.url}
                helperText={errors.url?.message}
              />
            </Box>
          )}

          {tab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Drag and drop a PDF, TXT, or DOCX file here, or click to browse.
                <br />
                (File upload coming soon in v2. Please use URL for MVP.)
              </Typography>
              <Button variant="outlined" disabled>
                Select File
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} color="inherit" disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={createMutation.isPending || tab === 1}>
            {createMutation.isPending ? 'Processing...' : 'Add Source'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
