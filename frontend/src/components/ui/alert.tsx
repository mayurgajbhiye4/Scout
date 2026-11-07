import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from '@/components/icons';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-4xl border p-4 flex items-start gap-3 text-sm',
  {
    variants: {
      variant: {
        default:
          'bg-muted border-border text-foreground',
        error:
          'bg-[var(--ws-danger)]/10 border-[var(--ws-danger)]/30 text-[var(--ws-danger)]',
        success:
          'bg-[var(--ws-accent-wash)] border-[var(--ws-accent)]/30 text-[var(--ws-accent-ink)]',
        warning:
          'bg-muted border-border text-foreground',
        info:
          'bg-[var(--ws-accent-wash)] border-[var(--ws-accent)]/30 text-[var(--ws-accent-ink)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const alertIcons = {
  default: <Info size={16} className="shrink-0 mt-0.5" />,
  error: <AlertCircle size={16} className="shrink-0 mt-0.5" />,
  success: <CheckCircle2 size={16} className="shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={16} className="shrink-0 mt-0.5" />,
  info: <Info size={16} className="shrink-0 mt-0.5" />,
};

interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof alertVariants> {
  hideIcon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', hideIcon = false, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hideIcon && alertIcons[variant ?? 'default']}
      <div className="flex-1">{children}</div>
    </div>
  )
);
Alert.displayName = 'Alert';

export { Alert };
