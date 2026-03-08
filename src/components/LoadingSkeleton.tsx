export function CardSkeleton() {
  return (
    <div className="border-b border-dark-border/60 px-4 py-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-dark-surface" />
        <div className="flex-1">
          <div className="h-4 bg-dark-surface rounded w-40 mb-2" />
          <div className="h-3.5 bg-dark-surface rounded w-52" />
        </div>
        <div className="flex gap-1">
          <div className="w-7 h-7 rounded-full bg-dark-surface" />
          <div className="w-7 h-7 rounded-full bg-dark-surface" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-3 bg-dark-surface rounded w-full" />
        <div className="h-3 bg-dark-surface rounded w-4/5" />
        <div className="h-3 bg-dark-surface rounded w-3/4" />
      </div>
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="bg-dark-card rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-dark-surface" />
          <div className="h-4 bg-dark-surface rounded w-10" />
        </div>
        <div className="h-3 bg-dark-surface rounded w-12" />
        <div className="flex items-center gap-2">
          <div className="h-4 bg-dark-surface rounded w-10" />
          <div className="w-8 h-8 rounded-full bg-dark-surface" />
        </div>
      </div>
    </div>
  );
}

export default function LoadingSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
