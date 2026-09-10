/**
 * DocumentUpload component with file upload dropzone / input.
 */

import { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { DocumentCreatePayload, SourceType } from '@/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Knowledge Source</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-4">
            <div>
              <label className="block text-sm text-[#A1A1AA] mb-1.5">Source Type</label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">Website / Documentation URL</SelectItem>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="youtube">YouTube Video URL</SelectItem>
                  <SelectItem value="github">GitHub Repository / File</SelectItem>
                  <SelectItem value="text">Plain Text / Markdown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm text-[#A1A1AA] mb-1.5">Title / Name</label>
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="e.g. Distributed Consensus Paper"
                required
              />
            </div>

            {sourceType !== 'text' && (
              <div>
                <label className="block text-sm text-[#A1A1AA] mb-1.5">URL</label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  required={sourceType === 'url' || sourceType === 'youtube'}
                />
              </div>
            )}

            {sourceType === 'text' && (
              <div>
                <label className="block text-sm text-[#A1A1AA] mb-1.5">Content</label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste plain text or markdown..."
                  rows={4}
                  required
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-t-transparent border-white animate-spin" />
              ) : (
                <CloudUpload size={15} />
              )}
              {loading ? 'Adding...' : 'Add Source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
