import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 flex items-start gap-3 text-sm',
  {
    variants: {
      variant: {
        default:
          'bg-[#17171C] border-[#27272A] text-[#F4F4F5]',
        error:
          'bg-red-950/30 border-red-800/50 text-red-300',
        success:
          'bg-emerald-950/30 border-emerald-800/50 text-emerald-300',
        warning:
          'bg-amber-950/30 border-amber-800/50 text-amber-300',
        info:
          'bg-sky-950/30 border-sky-800/50 text-sky-300',
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
