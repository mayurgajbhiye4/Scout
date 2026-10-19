import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Youtube, Link as LinkIcon, Loader2 } from '@/components/icons';
import { sessionsApi } from '@/api/sessions';
import { soundEffects } from '@/lib/soundEffects';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AttachSourcePopoverProps {
  sessionId: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  onAttached?: () => void;
}

export default function AttachSourcePopover({
  sessionId,
  children,
  side = 'top',
  align = 'start',
  sideOffset = 6,
  onAttached,
}: AttachSourcePopoverProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url.trim() || isAttaching) return;

    soundEffects.playSourceDrop();
    setIsAttaching(true);
    setAttachError(null);
    try {
      await sessionsApi.attachSource(sessionId, { url: url.trim() });
      soundEffects.playEmbeddingComplete();
      queryClient.invalidateQueries({ queryKey: ['session-sources', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setUrl('');
      setOpen(false);
      onAttached?.();
    } catch (err: any) {
      console.error('Failed to attach source:', err);
      setAttachError(err?.response?.data?.detail || 'Failed to ingest and attach source');
    } finally {
      setIsAttaching(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isAttaching) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setAttachError(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        onClick={(e) => e.stopPropagation()}
        className="w-[calc(100vw-2rem)] sm:w-[380px] max-w-[380px] p-0 overflow-hidden bg-[#141416] border-[#27272a] rounded-none shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-none bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-center justify-center text-[#ef4444] shrink-0">
              <Youtube size={16} />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-[#f4f4f5] leading-tight">
                Attach Knowledge Source
              </h4>
              <p className="text-[11px] text-[#a1a1aa] leading-normal mt-0.5">
                Paste a YouTube link or web URL to index into this chat.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <div className="absolute left-3 top-2.5 text-[#71717a]">
                <LinkIcon size={13} />
              </div>
              <Input
                autoFocus
                placeholder="https://www.youtube.com/watch?v=... or https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isAttaching}
                className="pl-8 bg-[#18181b] border-[#27272a] text-[#f4f4f5] text-base sm:text-xs placeholder:text-[#71717a] focus:border-[#2563eb] rounded-none h-9 sm:h-8"
              />
            </div>

            {attachError && (
              <p className="text-[11px] text-[#ef4444] font-medium leading-tight">{attachError}</p>
            )}

            {isAttaching && (
              <div className="space-y-1.5 py-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#a1a1aa] flex items-center gap-1.5 truncate">
                    <Loader2 size={11} className="animate-spin text-[#3b82f6] shrink-0" />
                    <span>Extracting transcript & embedding vectors...</span>
                  </span>
                </div>
                <div className="w-full h-1 bg-[#18181b] border border-[#27272a] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#06b6d4] animate-[indeterminateProgress_1.8s_ease-in-out_infinite]" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#27272a]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={isAttaching}
                className="text-xs text-[#a1a1aa] hover:text-[#f4f4f5] rounded-none h-7 px-3 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!url.trim() || isAttaching}
                className="text-xs rounded-none bg-[#2563eb] text-white hover:bg-[#1d4ed8] h-7 px-3 cursor-pointer"
              >
                {isAttaching ? 'Ingesting...' : 'Ingest & Attach'}
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
