import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-[#202024] border-[#27272a] text-[#F4F4F5]',
        blue:
          'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-500/50 text-teal-800 dark:text-[#2dd4bf]',
        success:
          'bg-[#042f2e] border-teal-700/60 text-teal-300',
        warning:
          'bg-[#202024] border-[#3f3f46] text-[#d4d4d8]',
        error:
          'bg-[#360d0d] border-red-700/60 text-red-400',
        info:
          'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-500/50 text-teal-800 dark:text-[#2dd4bf]',
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
