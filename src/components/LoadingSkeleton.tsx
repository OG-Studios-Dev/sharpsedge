export function CardSkeleton({ className = "h-28" }: { className?: string }) {
  return (
    <div className={`skeleton-surface p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-dark-border/70" />
        <div className="flex-1">
          <div className="mb-2 h-4 w-40 rounded bg-dark-border/70" />
          <div className="h-3.5 w-52 rounded bg-dark-border/60" />
        </div>
        <div className="flex gap-1">
          <div className="h-7 w-7 rounded-full bg-dark-border/70" />
          <div className="h-7 w-7 rounded-full bg-dark-border/70" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-3 w-full rounded bg-dark-border/60" />
        <div className="h-3 w-4/5 rounded bg-dark-border/60" />
        <div className="h-3 w-3/4 rounded bg-dark-border/60" />
      </div>
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="skeleton-surface rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-dark-border/70" />
          <div className="h-4 w-10 rounded bg-dark-border/70" />
        </div>
        <div className="h-3 w-12 rounded bg-dark-border/60" />
        <div className="flex items-center gap-2">
          <div className="h-4 w-10 rounded bg-dark-border/70" />
          <div className="h-8 w-8 rounded-full bg-dark-border/70" />
        </div>
      </div>
    </div>
  );
}

export function PropCardSkeleton() {
  return <CardSkeleton className="h-36" />;
}

export function TeamTrendCardSkeleton() {
  return <CardSkeleton className="h-32" />;
}

export function PickCardSkeleton() {
  return <CardSkeleton className="h-40" />;
}

export function TrendRowSkeleton() {
  return <CardSkeleton className="h-24" />;
}

export function LeaderboardSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface/70">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_50px_70px] gap-1 border-b border-dark-border/50 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500">
        <div>Pos</div>
        <div>Player</div>
        <div className="text-right">Tot</div>
        <div className="text-right">Thru</div>
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[36px_minmax(0,1fr)_50px_70px] gap-1 border-b border-dark-border/20 px-4 py-3 last:border-b-0">
          <div className="h-3 rounded bg-dark-border/60" />
          <div className="h-3 rounded bg-dark-border/70" />
          <div className="ml-auto h-3 w-8 rounded bg-dark-border/60" />
          <div className="ml-auto h-3 w-10 rounded bg-dark-border/60" />
        </div>
      ))}
    </div>
  );
}

export function OddsGameSkeleton() {
  return (
    <div className="skeleton-surface rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-dark-border/70" />
          <div className="h-5 w-36 rounded bg-dark-border/70" />
          <div className="h-5 w-36 rounded bg-dark-border/60" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-dark-border/60" />
          <div className="h-4 w-24 rounded bg-dark-border/60" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-10 rounded-xl bg-dark-border/50" />
        ))}
      </div>
    </div>
  );
}

export default function LoadingSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
