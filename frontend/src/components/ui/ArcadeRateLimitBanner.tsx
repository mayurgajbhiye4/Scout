import { useMemo } from 'react';
import { AlertTriangle, Clock, X, Sparkles } from '@/components/icons';
import { useRateLimit } from '@/lib/rateLimitManager';
import { cn } from '@/lib/utils';

interface ArcadeRateLimitBannerProps {
  scope?: string;
  className?: string;
  compact?: boolean;
}

export default function ArcadeRateLimitBanner({
  scope,
  className,
  compact = false,
}: ArcadeRateLimitBannerProps) {
  const { currentAlert, isRateLimited, secondsLeft, dismiss } = useRateLimit(scope);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [secondsLeft]);

  if (!isRateLimited || !currentAlert || secondsLeft <= 0) {
    return null;
  }

  const percentLeft = Math.min(
    100,
    Math.max(0, Math.round((secondsLeft / (currentAlert.retryAfter || 60)) * 100))
  );

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3.5 py-1.5 border border-[#ef4444]/50 bg-[#16161f]/95 text-xs text-[#f4f4f5] shadow-[0_0_15px_rgba(239,68,68,0.15)] arcade-scanlines rounded-full',
          className
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ef4444]"></span>
          </span>
          <span className="text-[11px] font-bold text-[#ef4444] uppercase truncate">
            COOLDOWN ACTIVE: {currentAlert.scope}
          </span>
          <span className="text-[11px] text-[#a1a1aa] hidden sm:inline truncate">
            ({currentAlert.limit}/min limit)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 border border-[#ef4444]/40 bg-[#ef4444]/10 text-[#f87171] font-extrabold text-[11px] rounded-full">
            {formattedTime}
          </span>
          <button
            onClick={() => dismiss(currentAlert.id)}
            className="text-[#71717a] hover:text-[#f4f4f5] p-0.5 rounded-full"
            title="Dismiss notification"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative border border-[#ef4444]/50 bg-[#12121a]/95 p-4 arcade-scanlines shadow-[0_0_25px_rgba(239,68,68,0.18)] text-[#f4f4f5] rounded-2xl sm:rounded-3xl',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 border border-[#ef4444]/40 bg-[#ef4444]/15 text-[#ef4444] shrink-0 mt-0.5 rounded-xl">
            <AlertTriangle size={14} className="animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#ef4444]">
                {currentAlert.title}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#ef4444]/30 bg-[#ef4444]/10 text-[#f87171] rounded-full">
                {currentAlert.scope}
              </span>
            </div>
            <p className="text-xs text-[#a1a1aa] leading-relaxed">
              {currentAlert.message}
            </p>
            <p className="text-[11px] text-[#71717a] flex items-center gap-1.5 pt-0.5">
              <Sparkles size={11} className="text-[#ef4444]" />
              {currentAlert.suggestion}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => dismiss(currentAlert.id)}
              className="text-[#71717a] hover:text-[#f4f4f5] p-1 rounded-full"
              title="Dismiss warning"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 border border-[#ef4444]/40 bg-[#181824] text-[#f87171] font-mono font-bold text-xs tracking-wider rounded-full">
            <Clock size={12} className="animate-spin text-[#ef4444]" />
            {formattedTime}
          </div>
        </div>
      </div>

      {/* Progress depletion bar */}
      <div className="mt-3 w-full h-1 bg-[#18181b] border border-[#27272a] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#ef4444] transition-all duration-1000 ease-linear"
          style={{ width: `${percentLeft}%` }}
        />
      </div>
    </div>
  );
}
