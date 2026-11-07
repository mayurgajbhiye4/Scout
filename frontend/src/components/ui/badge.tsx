import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--ws-dock)] border-[var(--ws-line)] text-[var(--ws-ink)]',
        blue:
          'bg-[var(--ws-accent-wash)] border-[var(--ws-accent)]/50 text-[var(--ws-accent-ink)]',
        success:
          'bg-[var(--ws-accent-wash)] border-[var(--ws-accent)]/50 text-[var(--ws-accent-ink)]',
        warning:
          'bg-[var(--ws-dock)] border-[var(--ws-line-strong)] text-[var(--ws-ink-soft)]',
        error:
          'bg-[var(--ws-danger)]/15 border-[var(--ws-danger)]/40 text-[var(--ws-danger)]',
        info:
          'bg-[var(--ws-accent-wash)] border-[var(--ws-accent)]/50 text-[var(--ws-accent-ink)]',
        outline:
          'bg-transparent border-[var(--ws-line)] text-[var(--ws-ink-soft)]',
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
