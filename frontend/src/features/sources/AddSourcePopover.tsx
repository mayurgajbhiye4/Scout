import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, SourceCreateSchema, SourceCreateData } from '@/api/sources';
import { Link as LinkIcon, Plus } from 'lucide-react';
import { soundEffects } from '@/lib/soundEffects';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddSourcePopoverProps {
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function AddSourcePopover({
  children,
  side = 'bottom',
  align = 'end',
  sideOffset = 6,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: AddSourcePopoverProps) {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isControlled) {
      setControlledOpen?.(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
    if (!nextOpen) {
      reset();
    }
  };

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
      soundEffects.playEmbeddingComplete();
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      reset();
      handleOpenChange(false);
      onSuccess?.();
    },
  });

  const onSubmit = (data: SourceCreateData) => {
    soundEffects.playSourceDrop();
    createMutation.mutate(data);
  };

  const isPending = createMutation.isPending;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        onClick={(e) => e.stopPropagation()}
        className="w-[320px] sm:w-[350px] p-0 overflow-hidden bg-[#141416] border-[#27272a] rounded-none shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-none bg-[#2563eb]/10 border border-[#2563eb]/30 flex items-center justify-center text-[#3b82f6] shrink-0">
              <Plus size={16} />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-[#f4f4f5] leading-tight">
                Add Knowledge Source
              </h4>
              <p className="text-[11px] text-[#a1a1aa] leading-normal mt-0.5">
                Ingest web article or documentation into AI workspace.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label className="block text-[11px] text-[#a1a1aa] mb-1 font-mono">SOURCE URL</label>
              <div className="relative">
                <div className="absolute left-2.5 top-2 text-[#71717a]">
                  <LinkIcon size={13} />
                </div>
                <Input
                  autoFocus
                  placeholder="https://example.com/article"
                  {...register('url')}
                  className={`pl-8 bg-[#18181b] border-[#27272a] text-[#f4f4f5] text-xs placeholder:text-[#71717a] focus:border-[#2563eb] rounded-none h-8 ${
                    errors.url ? 'border-red-500' : ''
                  }`}
                />
              </div>
              {errors.url && (
                <p className="text-[11px] text-red-400 mt-1">{errors.url.message}</p>
              )}
            </div>

            {isPending && (
              <div className="space-y-1.5 py-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#a1a1aa] flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 bg-[#3b82f6] animate-ping" />
                    <span>Extracting & generating vector embeddings...</span>
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
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                className="text-xs text-[#a1a1aa] hover:text-[#f4f4f5] rounded-none h-7 px-3 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="text-xs rounded-none bg-[#2563eb] text-white hover:bg-[#1d4ed8] h-7 px-3 cursor-pointer"
              >
                {isPending ? 'Processing...' : 'Add Source'}
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
