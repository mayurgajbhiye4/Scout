import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[#1C1C22]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
