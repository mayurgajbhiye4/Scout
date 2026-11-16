import { useEffect, useRef, type CSSProperties } from 'react';
import type { AnimatedIconHandle } from '@/components/icons';
import type { PipelineStage } from '@/features/marketing/pipelineStages';
import { cn } from '@/lib/utils';

interface PipelineStripProps {
  /** A run of the visitor page's pipeline stages, drawn left to right. */
  stages: PipelineStage[];
  /** The stage under way: earlier ones show as done, later ones wait. */
  active: number;
  /** Puts each stage's name under its icon. */
  titles?: boolean;
  size?: 'sm' | 'md';
  /** An arc from one stage back to an earlier one (the agent's retry). `live` once the loop has been taken. */
  loop?: { from: number; to: number; live: boolean };
  className?: string;
}

/**
 * Part of the visitor page's pipeline diagram (features/marketing/PipelineDiagram.tsx), drawn while the workspace
 * runs it: the stages on a track, a pulse running along it on a loop, and the stage under way lit. Decorative: the
 * words beside it (the ingest status, the agent's steps) say the same for screen readers.
 */
export default function PipelineStrip({ stages, active, titles = false, size = 'sm', loop, className }: PipelineStripProps) {
  const n = stages.length;
  const iconSize = size === 'sm' ? 14 : 17;

  // A stage's icon plays its own little motion as the stage begins
  const icons = useRef<Array<AnimatedIconHandle | null>>([]);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    icons.current[active]?.startAnimation();
  }, [active]);
  return (
    <div
      className={cn('ws-pipe', `ws-pipe--${size}`, loop && 'has-loop', className)}
      style={{ '--n': n } as CSSProperties}
      aria-hidden
    >
      <div className="relative">
        <div className="ws-pipe-track">
          <span className="ws-pipe-pulse">
            <span className="ws-pipe-dot" />
          </span>
        </div>

        {loop && (
          <svg
            className={cn('ws-pipe-loop', loop.live && 'is-live')}
            style={{ left: `calc(100% * ${loop.to + 0.5} / ${n})`, width: `calc(100% * ${loop.from - loop.to} / ${n})` }}
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
          >
            <path d="M 100 40 C 100 4, 0 4, 0 40" fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
        )}

        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <li key={stage.title} className="flex min-w-0 flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    'ws-pipe-node bg-[var(--ws-solid)]',
                    i < active && 'is-done',
                    i === active && 'is-active'
                  )}
                >
                  <Icon
                    ref={(el) => {
                      icons.current[i] = el;
                    }}
                    size={iconSize}
                  />
                </span>
                {titles && (
                  <span className={cn('ws-pipe-title', i === active && 'is-active')}>{stage.title}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
