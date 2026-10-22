import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, SourceCreateSchema, SourceCreateData } from '@/api/sources';
import { Link as LinkIcon, Plus } from '@/components/icons';
import { soundEffects } from '@/lib/soundEffects';
import ArcadeRateLimitBanner from '@/components/ui/ArcadeRateLimitBanner';
import { useRateLimit } from '@/lib/rateLimitManager';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  const { isScopeRateLimited, getScopeSecondsLeft } = useRateLimit();
  const isIngestRateLimited = isScopeRateLimited('sources:ingest');
  const ingestCooldownSec = getScopeSecondsLeft('sources:ingest');
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
    if (isIngestRateLimited) {
      soundEffects.playRateLimitWarning();
      return;
    }
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
        className="w-[320px] sm:w-[350px] p-0 overflow-hidden bg-white dark:bg-[#141416] border border-slate-200 dark:border-[#27272a] rounded-2xl sm:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 text-left select-none"
      >
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
              <Plus size={16} />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-[#f4f4f5] leading-tight">
                Add Knowledge Source
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-[#a1a1aa] leading-normal mt-0.5">
                Ingest web article or documentation into AI workspace.
              </p>
            </div>
          </div>

          {/* Rate limit warning banner */}
          <ArcadeRateLimitBanner scope="sources:ingest" compact />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-[#a1a1aa] mb-1 font-mono">SOURCE URL</label>
              <div className="relative">
                <div className="absolute left-3 top-2 text-slate-400 dark:text-[#71717a]">
                  <LinkIcon size={13} />
                </div>
                <Input
                  autoFocus
                  placeholder="https://example.com/article"
                  {...register('url')}
                  className={`pl-8.5 bg-slate-50 dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-900 dark:text-[#f4f4f5] text-xs placeholder:text-slate-400 dark:placeholder:text-[#71717a] focus:border-primary rounded-full h-8 ${errors.url ? 'border-red-500' : ''
                    }`}
                />
              </div>
              {errors.url && (
                <p className="text-[11px] text-red-500 mt-1">{errors.url.message}</p>
              )}
            </div>

            {isPending && (
              <div className="space-y-1.5 py-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-600 dark:text-[#a1a1aa] flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                    <span>Extracting & generating vector embeddings...</span>
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary via-teal-400 to-cyan-400 animate-[indeterminateProgress_1.8s_ease-in-out_infinite]" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#27272a]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                className="text-xs text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-[#f4f4f5] rounded-full h-7 px-3.5 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || isIngestRateLimited}
                className={cn(
                  "text-xs rounded-full h-7 px-3.5 cursor-pointer",
                  isIngestRateLimited
                    ? "bg-amber-500/20 text-amber-700 dark:text-[#fbbf24] border border-amber-500/50 cursor-not-allowed shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                    : "bg-primary text-white hover:bg-primary/90"
                )}
              >
                {isPending
                  ? 'Processing...'
                  : isIngestRateLimited
                    ? `Cooldown ${ingestCooldownSec}s`
                    : 'Add Source'}
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
