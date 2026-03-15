"use client";

type TimelineItem = {
  label: string;
  value: number | null;
};

type HitRateTimelineProps = {
  items: TimelineItem[];
};

function getTone(value: number | null) {
  if (value === null) return "border-dark-border bg-dark-bg/70 text-gray-500";
  if (value > 60) return "border-emerald-500/35 bg-emerald-500/12 text-emerald-100";
  if (value >= 40) return "border-amber-500/35 bg-amber-500/12 text-amber-100";
  return "border-red-500/35 bg-red-500/12 text-red-100";
}

export default function HitRateTimeline({ items }: HitRateTimelineProps) {
  return (
    <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Hit Rate Timeline</p>
          <p className="mt-1 text-sm text-gray-300">Recent, matchup, and season context.</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item) => (
          <div
            key={item.label}
            className={`min-w-[92px] rounded-[22px] border px-3 py-3 text-center ${getTone(item.value)}`}
          >
            <p className="text-[11px] uppercase tracking-[0.18em]">{item.label}</p>
            <p className="mt-2 text-sm font-semibold">
              {item.value === null ? "—" : `${Math.round(item.value)}%`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
