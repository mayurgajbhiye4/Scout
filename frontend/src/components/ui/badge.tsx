import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-[#1C1C22] border-[#27272A] text-[#D4D4D8]',
        success:
          'bg-emerald-950/60 border-emerald-800/60 text-emerald-400',
        warning:
          'bg-amber-950/60 border-amber-800/60 text-amber-400',
        error:
          'bg-red-950/60 border-red-800/60 text-red-400',
        info:
          'bg-sky-950/60 border-sky-800/60 text-sky-400',
        outline:
          'bg-transparent border-[#27272A] text-[#A1A1AA]',
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
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
