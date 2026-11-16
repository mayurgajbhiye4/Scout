import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ArrowCtaProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Classes for the fill behind the label (background, glass, shadow); it squashes slightly on hover. */
  fillClassName?: string;
}

/**
 * Primary call to action with a travelling arrow: on hover the arrow slides out on the right while another slides
 * in on the left and nudges the label over (motion in styles/global.css, `.ui-cta`). Text colour, height and font
 * come from `className`; the right padding leaves room for the resting arrow.
 */
export const ArrowCta = React.forwardRef<HTMLButtonElement, ArrowCtaProps>(
  ({ className, fillClassName, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'ui-cta inline-flex shrink-0 items-center whitespace-nowrap rounded-lg pl-4 pr-10 cursor-pointer select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn('ui-cta__bg', fillClassName)} />
      <span aria-hidden="true" className="ui-cta__arrow ui-cta__arrow--lead">
        <ArrowRight size={15} strokeWidth={2.25} />
      </span>
      <span className="ui-cta__label">{children}</span>
      <span aria-hidden="true" className="ui-cta__arrow ui-cta__arrow--trail">
        <ArrowRight size={15} strokeWidth={2.25} />
      </span>
    </button>
  )
);
ArrowCta.displayName = 'ArrowCta';
