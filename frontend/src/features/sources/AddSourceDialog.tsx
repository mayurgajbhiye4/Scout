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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => sourcesApi.uploadDocument(workspaceId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId] });
      handleClose();
    },
  });

  const handleClose = () => {
    reset();
    setSelectedFile(null);
    setTab(0);
    onClose();
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
    setValue('source_type', newValue === 0 ? 'url' : 'file');
    setValue('url', '');
    setValue('filename', '');
    setSelectedFile(null);
  };

  const onSubmit = (data: DocumentCreateData) => {
    if (tab === 1) {
      if (!selectedFile) {
        return;
      }
      uploadMutation.mutate(selectedFile);
      return;
    }
    createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || uploadMutation.isPending;

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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Select a PDF, TXT, Markdown, or DOCX document to be ingested into your workspace knowledge base.
              </Typography>
              <input
                type="file"
                id="document-file-upload-input"
                accept=".pdf,.txt,.md,.docx,text/plain,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
              <label htmlFor="document-file-upload-input">
                <Button variant="outlined" component="span">
                  {selectedFile ? 'Change Selected File' : 'Select File'}
                </Button>
              </label>
              {selectedFile && (
                <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} color="inherit" disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isPending || (tab === 1 && !selectedFile)}>
            {isPending ? 'Processing...' : 'Add Source'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
