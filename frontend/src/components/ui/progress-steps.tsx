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
                    isCompleted ? 'bg-white' : 'bg-[#27272A]'
                  )}
                />
              )}
              {/* Step circle */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition-all duration-300 text-xs font-semibold',
                  isCompleted
                    ? 'bg-white border-white text-[#09090B]'
                    : isActive
                    ? 'border-white bg-transparent text-white'
                    : 'border-[#27272A] bg-transparent text-[#71717A]'
                )}
              >
                {isActive ? (
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent border-white animate-spin" />
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
                    isCompleted ? 'bg-white' : 'bg-[#27272A]'
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                'mt-2 text-xs text-center transition-colors',
                isActive ? 'text-[#F4F4F5] font-medium' : isCompleted ? 'text-[#A1A1AA]' : 'text-[#71717A]'
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
