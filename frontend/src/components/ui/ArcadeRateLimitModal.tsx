import { useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  Sparkles,
  X,
  Volume2,
  VolumeX,
  Database,
  BrainCircuit,
  MessageSquare,
  Layers,
} from '@/components/icons';
import { useRateLimit, RateLimitAlert } from '@/lib/rateLimitManager';
import { useSoundEffects } from '@/lib/soundEffects';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface ArcadeRateLimitModalProps {
  alert?: RateLimitAlert | null;
  onClose?: () => void;
}

export default function ArcadeRateLimitModal({
  alert: propAlert,
  onClose: propOnClose,
}: ArcadeRateLimitModalProps) {
  const { currentAlert, dismiss } = useRateLimit();
  const { soundEnabled, toggleSound } = useSoundEffects();

  const activeAlert = propAlert || currentAlert;
  const secondsLeft = activeAlert ? activeAlert.secondsLeft : 0;

  const formattedTime = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [secondsLeft]);

  if (!activeAlert || activeAlert.secondsLeft <= 0) {
    return null;
  }

  const handleDismiss = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      dismiss(activeAlert.id);
    }
  };

  // Progress percentage (100% when starting cooldown -> 0% when completed)
  const percentLeft = Math.min(
    100,
    Math.max(0, Math.round((activeAlert.secondsLeft / (activeAlert.retryAfter || 60)) * 100))
  );

  const getCategoryIcon = () => {
    switch (activeAlert.category) {
      case 'ingestion':
        return <Layers className="text-[#f59e0b] animate-pulse" size={16} />;
      case 'chat':
        return <MessageSquare className="text-[#38bdf8] animate-pulse" size={16} />;
      case 'knowledge':
        return <BrainCircuit className="text-[#a855f7] animate-pulse" size={16} />;
      case 'auth':
        return <AlertTriangle className="text-[#ef4444] animate-pulse" size={16} />;
      default:
        return <Database className="text-[#f59e0b] animate-pulse" size={16} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Arcade cabinet framing card */}
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden border border-amber-500/50 bg-white dark:bg-[#0d0d12]',
          'shadow-[0_16px_50px_rgba(245,158,11,0.2),_inset_0_0_20px_rgba(245,158,11,0.06)]',
          'arcade-scanlines text-slate-900 dark:text-[#f4f4f5] rounded-3xl'
        )}
      >
        {/* Top arcade neon marquee header bar */}
        <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-amber-500/30 bg-amber-50/80 dark:bg-[#16161f]/90">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="text-[11px] font-mono font-bold tracking-widest text-amber-700 dark:text-[#f59e0b] uppercase">
              SYSTEM COOLDOWN // RATE LIMIT HIT
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* SFX audio status badge */}
            <button
              onClick={toggleSound}
              type="button"
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono border transition-all rounded-full',
                soundEnabled
                  ? 'border-teal-300 dark:border-teal-500/40 text-teal-800 dark:text-[#2dd4bf] bg-teal-50 dark:bg-teal-500/10'
                  : 'border-slate-300 dark:border-[#52525b] text-slate-500 dark:text-[#71717a] bg-slate-100 dark:bg-[#18181b]'
              )}
              title={soundEnabled ? 'Arcade sound effects active' : 'Sound muted'}
            >
              {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
              <span>{soundEnabled ? 'SFX ON' : 'MUTED'}</span>
            </button>

            {/* Close / Dismiss */}
            <button
              onClick={handleDismiss}
              className="p-1 text-slate-400 hover:text-slate-800 dark:text-[#71717a] dark:hover:text-[#f4f4f5] transition-colors rounded-full"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-6">
          {/* Main Title & Scope badge */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-[#f59e0b] rounded-lg">
                {getCategoryIcon()}
              </div>
              <h3 className="text-base font-bold font-mono tracking-wide text-slate-900 dark:text-[#f4f4f5] uppercase">
                {activeAlert.title}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#a1a1aa] leading-relaxed">
              {activeAlert.message}
            </p>
          </div>

          {/* Central Glowing Countdown Display */}
          <div className="relative p-5 border border-amber-500/30 bg-amber-50/50 dark:bg-[#121218]/90 overflow-hidden text-center rounded-2xl shadow-[inset_0_0_20px_rgba(245,158,11,0.06)] dark:shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-700 dark:text-[#f59e0b]/80 mb-1 flex items-center justify-center gap-1.5">
              <Clock size={12} className="animate-spin text-amber-600 dark:text-[#f59e0b]" />
              COOLING DOWN QUOTA
            </div>

            {/* Huge Monospace Neon Timer */}
            <div className="text-5xl font-mono font-extrabold tracking-wider text-amber-600 dark:text-[#fbbf24] drop-shadow-[0_0_15px_rgba(245,158,11,0.3)] dark:drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] my-2">
              {formattedTime}
            </div>

            <p className="text-[11px] font-mono text-slate-500 dark:text-[#71717a]">
              Request quota restores automatically when the timer reaches 00:00
            </p>

            {/* Animated depletion bar */}
            <div className="mt-4 w-full h-1.5 bg-slate-200 dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] overflow-hidden relative rounded-full">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-teal-600 dark:to-teal-400 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${percentLeft}%` }}
              />
            </div>
          </div>

          {/* Telemetry / Scope Details Box */}
          <div className="p-3 border border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#141419]/70 text-[11px] font-mono space-y-1.5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-700 dark:text-[#a1a1aa]">
              <span className="text-slate-500 dark:text-[#71717a]">PROTECTED SCOPE:</span>
              <span className="font-bold text-amber-700 dark:text-[#f59e0b]">{activeAlert.scope}</span>
            </div>
            <div className="flex items-center justify-between text-slate-700 dark:text-[#a1a1aa]">
              <span className="text-slate-500 dark:text-[#71717a]">BURST LIMIT:</span>
              <span>{activeAlert.limit} requests / {activeAlert.windowSeconds}s</span>
            </div>
            <div className="flex items-center justify-between text-slate-700 dark:text-[#a1a1aa]">
              <span className="text-slate-500 dark:text-[#71717a]">COOLDOWN WINDOW:</span>
              <span>{activeAlert.retryAfter}s duration</span>
            </div>
          </div>

          {/* Suggestion notice */}
          <div className="flex items-start gap-2 p-3 bg-amber-50/70 dark:bg-[#181820]/60 border-l-2 border-amber-500 rounded-xl text-[11px] text-slate-700 dark:text-[#a1a1aa]">
            <Sparkles size={13} className="text-amber-600 dark:text-[#f59e0b] shrink-0 mt-0.5" />
            <span>{activeAlert.suggestion}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="rounded-full border-amber-500/50 text-amber-700 dark:text-[#fbbf24] hover:bg-amber-500/15 hover:border-amber-500 font-mono text-xs tracking-wider uppercase transition-all px-5"
            >
              [ ACKNOWLEDGE ]
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
