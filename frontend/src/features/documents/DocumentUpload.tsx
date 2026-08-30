/**
 * DocumentUpload component with file upload dropzone / input.
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { DocumentCreatePayload, SourceType } from '@/types';

interface DocumentUploadProps {
  open: boolean;
  onClose: () => void;
  onUpload: (payload: DocumentCreatePayload) => Promise<void>;
}

export default function DocumentUpload({ open, onClose, onUpload }: DocumentUploadProps) {
  const [sourceType, setSourceType] = useState<SourceType>('url');
  const [filename, setFilename] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onUpload({
        source_type: sourceType,
        filename: filename || url || 'Document',
        url: url || undefined,
        content: content || undefined,
      });
      onClose();
      setFilename('');
      setUrl('');
      setContent('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add Knowledge Source</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Source Type</InputLabel>
              <Select
                value={sourceType}
                label="Source Type"
                onChange={(e) => setSourceType(e.target.value as SourceType)}
              >
                <MenuItem value="url">Website / Documentation URL</MenuItem>
                <MenuItem value="pdf">PDF Document</MenuItem>
                <MenuItem value="youtube">YouTube Video URL</MenuItem>
                <MenuItem value="github">GitHub Repository / File</MenuItem>
                <MenuItem value="text">Plain Text / Markdown</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Title / Name"
              size="small"
              fullWidth
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="e.g. Distributed Consensus Paper"
              required
            />

            {sourceType !== 'text' && (
              <TextField
                label="URL"
                size="small"
                fullWidth
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required={sourceType === 'url' || sourceType === 'youtube'}
              />
            )}

            {sourceType === 'text' && (
              <TextField
                label="Content"
                size="small"
                fullWidth
                multiline
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste plain text or markdown..."
                required
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
          >
            {loading ? 'Adding...' : 'Add Source'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
