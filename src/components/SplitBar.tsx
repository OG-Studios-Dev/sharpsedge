import { TrendSplit } from "@/lib/types";

function getHitRateColor(rate: number): string {
  if (rate >= 90) return "text-emerald-400";
  if (rate >= 80) return "text-emerald-400";
  if (rate >= 70) return "text-yellow-400";
  return "text-red-400";
}

export default function SplitBar({ split }: { split: TrendSplit }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-[13px] text-gray-400 leading-tight">
        &bull; {split.label}
      </span>
      <span className={`text-[13px] font-semibold shrink-0 ${getHitRateColor(split.hitRate)}`}>
        {split.hitRate}%
      </span>
    </div>
  );
}
