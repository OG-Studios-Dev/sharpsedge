export function CardSkeleton() {
  return (
    <div className="mx-3 my-3 rounded-[24px] border border-dark-border/80 bg-dark-card p-5 relative overflow-hidden">
      {/* The shimmer element */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-accent-blue/5 to-transparent skew-x-12" />
      
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-dark-surface shrink-0" />
        <div className="flex-1">
          <div className="h-5 bg-dark-surface rounded-md w-40 mb-3" />
          <div className="h-3.5 bg-dark-surface rounded w-52" />
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <div className="w-14 h-4 bg-dark-surface rounded" />
          <div className="w-10 h-4 bg-dark-surface rounded self-end" />
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-dark-border/40 grid grid-cols-3 gap-3">
        <div className="h-4 bg-dark-surface rounded w-full" />
        <div className="h-4 bg-dark-surface rounded w-full" />
        <div className="h-4 bg-dark-surface rounded w-full" />
      </div>
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="rounded-2xl border border-dark-border/80 bg-gradient-to-br from-dark-surface/80 to-dark-bg p-5 relative overflow-hidden">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-accent-blue/5 to-transparent skew-x-12" />
      
      <div className="flex items-center justify-between mb-5">
        <div className="h-3 bg-dark-surface rounded w-16" />
        <div className="h-3 bg-dark-surface rounded w-10" />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-dark-surface shrink-0" />
          <div className="h-4 bg-dark-surface rounded w-12" />
        </div>
        <div className="h-3 bg-dark-surface rounded w-4" />
        <div className="flex items-center justify-end gap-3 text-right">
          <div className="h-4 bg-dark-surface rounded w-12" />
          <div className="w-9 h-9 rounded-full bg-dark-surface shrink-0" />
        </div>
      </div>
      
      <div className="mt-5 pt-4 border-t border-dark-border/40 flex justify-between">
         <div className="h-8 bg-dark-surface rounded-xl w-1/3" />
         <div className="h-8 bg-dark-surface rounded-xl w-1/3" />
      </div>
    </div>
  );
}

export default function LoadingSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
