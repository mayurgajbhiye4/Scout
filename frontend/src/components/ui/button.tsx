import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'bg-[#2563eb] text-white hover:bg-[#1d4ed8] border border-[#2563eb]',
        secondary:
          'bg-[#202024] text-[#F4F4F5] hover:bg-[#28282e] border border-[#27272a]',
        outline:
          'border border-[#27272a] bg-transparent text-[#F4F4F5] hover:bg-[#202024] hover:border-[#3f3f46]',
        ghost:
          'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#202024]',
        destructive:
          'bg-[#EF4444] text-white hover:bg-[#dc2626] border border-[#EF4444]',
        link:
          'text-[#3b82f6] underline-offset-4 hover:underline hover:text-white p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6 text-sm',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
