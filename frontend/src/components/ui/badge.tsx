import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-[#202024] border-[#27272a] text-[#F4F4F5]',
        blue:
          'bg-[#14233c] border-[#2563eb] text-[#3b82f6]',
        success:
          'bg-[#062d1f] border-emerald-700/60 text-emerald-400',
        warning:
          'bg-[#331e07] border-amber-700/60 text-amber-400',
        error:
          'bg-[#360d0d] border-red-700/60 text-red-400',
        info:
          'bg-[#14233c] border-[#2563eb] text-[#3b82f6]',
        outline:
          'bg-transparent border-[#27272a] text-[#A1A1AA]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      data-badge={variant || 'default'}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
