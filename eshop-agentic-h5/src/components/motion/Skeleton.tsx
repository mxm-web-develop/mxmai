import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-2xl bg-surface-muted', className)}
      aria-hidden
    />
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="card flex items-center gap-3 p-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function ServiceCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface p-3">
      <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}
