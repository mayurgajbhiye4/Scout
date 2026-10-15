import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-none bg-[#27272a]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
