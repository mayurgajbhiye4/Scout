import { cn } from '@/lib/utils';

/**
 * The Scout name in pixel type, with three slanted teal marks that fade out behind it. The same mark on the
 * visitor page, the workspace and the 404 page; the marks fold away on narrow screens.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="font-arcade text-[19px] font-bold leading-none tracking-wider">SCOUT</span>
      <span className="hidden items-center gap-[3px] sm:flex" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3.5 w-[5px] -skew-x-[18deg] rounded-full bg-[var(--ws-accent)]" style={{ opacity: 1 - i * 0.22 }} />
        ))}
      </span>
    </span>
  );
}
