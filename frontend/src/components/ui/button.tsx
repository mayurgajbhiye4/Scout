import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-white text-[#09090B] hover:bg-zinc-200 shadow-sm hover:shadow-[0_4px_18px_rgba(255,255,255,0.18)]',
        outline:
          'border border-[#27272A] bg-transparent text-[#F4F4F5] hover:border-[#3F3F46] hover:bg-white/5',
        ghost:
          'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/5',
        destructive:
          'bg-[#EF4444] text-white hover:bg-[#DC2626]',
        link:
          'text-[#818CF8] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-5 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-7 text-base',
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
