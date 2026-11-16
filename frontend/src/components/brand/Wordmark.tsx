import { useId } from 'react';
import { cn } from '@/lib/utils';

// Gaps cut across the lower half of the sun, widening toward the horizon: [y, height] in a 24-unit box
const SUN_BANDS: Array<[number, number]> = [
  [12.6, 1.1],
  [15.4, 1.5],
  [18.2, 1.9],
];

/** The Dusk mark: an orange sun setting through bands of evening haze. Also drawn in public/favicon.svg. */
export function SunMark({ size = 18, className }: { size?: number; className?: string }) {
  // useId's colons would break the url(#…) reference, so keep only safe characters
  const maskId = `dusk-sun-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn('shrink-0', className)} aria-hidden>
      <mask id={maskId}>
        <rect width="24" height="24" fill="#fff" />
        {SUN_BANDS.map(([y, h]) => (
          <rect key={y} x="0" y={y} width="24" height={h} fill="#000" />
        ))}
      </mask>
      <circle cx="12" cy="12" r="10" fill="var(--ws-accent)" mask={`url(#${maskId})`} />
    </svg>
  );
}

/**
 * The Dusk name in Geist after the sun mark. The same mark on the visitor page, the workspace and the 404
 * page.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <SunMark />
      <span className="font-wordmark text-[20px] font-bold leading-none">Dusk</span>
    </span>
  );
}
