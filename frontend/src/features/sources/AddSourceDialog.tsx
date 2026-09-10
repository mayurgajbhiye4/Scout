import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, DocumentCreateSchema, DocumentCreateData } from '@/api/sources';
import { Link as LinkIcon, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddSourceDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}

export default function AddSourceDialog({ open, onClose, workspaceId }: AddSourceDialogProps) {
  const [tab, setTab] = useState<'url' | 'file'>('url');
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
    defaultValues: { source_type: 'url', url: '', filename: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: DocumentCreateData) => sourcesApi.createDocument(workspaceId, data),
    onSuccess: () => {
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
    setTab('url');
    onClose();
  };

  const handleTabChange = (value: string) => {
    const t = value as 'url' | 'file';
    setTab(t);
    setValue('source_type', t);
    setValue('url', '');
    setValue('filename', '');
    setSelectedFile(null);
  };

  const onSubmit = (data: DocumentCreateData) => {
    if (tab === 'file') {
      if (!selectedFile) return;
      uploadMutation.mutate(selectedFile);
      return;
    }
    createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Knowledge Source</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
          <div className="px-6">
            <TabsList className="w-full">
              <TabsTrigger value="url" className="flex-1">
                <LinkIcon size={14} /> Web URL
              </TabsTrigger>
              <TabsTrigger value="file" className="flex-1">
                <FileText size={14} /> Document Upload
              </TabsTrigger>
            </TabsList>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="px-6 py-5 min-h-[140px]">
              <TabsContent value="url">
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-[#A1A1AA]">
                    Enter the URL of a web page, article, or documentation to be ingested by the AI.
                  </p>
                  <div>
                    <label className="block text-sm text-[#A1A1AA] mb-1.5">URL</label>
                    <Input
                      autoFocus
                      placeholder="https://example.com/article"
                      {...register('url')}
                      className={errors.url ? 'border-[#EF4444]' : ''}
                    />
                    {errors.url && (
                      <p className="text-xs text-[#EF4444] mt-1">{errors.url.message}</p>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="file">
                <div className="flex flex-col items-center gap-3 py-3">
                  <p className="text-xs text-[#A1A1AA] text-center">
                    Select a PDF, TXT, Markdown, or DOCX document to be ingested into your workspace knowledge base.
                  </p>
                  <input
                    type="file"
                    id="document-file-upload-input"
                    accept=".pdf,.txt,.md,.docx,text/plain,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                    }}
                  />
                  <label htmlFor="document-file-upload-input">
                    <Button variant="outline" size="sm" asChild>
                      <span className="cursor-pointer">
                        {selectedFile ? 'Change Selected File' : 'Select File'}
                      </span>
                    </Button>
                  </label>
                  {selectedFile && (
                    <p className="text-sm text-[#10B981] font-medium">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              </TabsContent>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || (tab === 'file' && !selectedFile)}
              >
                {isPending ? 'Processing...' : 'Add Source'}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
