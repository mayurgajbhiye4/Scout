import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface ProgressStepsProps {
  steps: string[];
  activeStep: number;
  className?: string;
}

function ProgressSteps({ steps, activeStep, className }: ProgressStepsProps) {
  return (
    <div className={cn('flex items-center w-full', className)}>
      {steps.map((label, idx) => {
        const isCompleted = idx < activeStep;
        const isActive = idx === activeStep;
        return (
          <div key={label} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {/* Left connector */}
              {idx > 0 && (
                <div
                  className={cn(
                    'h-px flex-1 transition-colors duration-300',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
              {/* Step circle */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition-all duration-300 text-xs font-semibold',
                  isCompleted
                    ? 'bg-primary border-primary text-primary-foreground'
                    : isActive
                    ? 'border-primary bg-transparent text-primary'
                    : 'border-border bg-transparent text-muted-foreground'
                )}
              >
                {isActive ? (
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent border-primary animate-spin" />
                ) : isCompleted ? (
                  <Check size={14} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              {/* Right connector */}
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'h-px flex-1 transition-colors duration-300',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                'mt-2 text-xs text-center transition-colors',
                isActive ? 'text-foreground font-medium' : isCompleted ? 'text-muted-foreground' : 'text-muted-foreground/60'
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { ProgressSteps };
