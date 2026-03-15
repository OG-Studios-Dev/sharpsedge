import { TrendSplit } from "@/lib/types";

function formatRate(split: TrendSplit) {
  return split.total > 0 ? `${Math.round(split.hitRate)}%` : "Soon";
}

export default function TrendSplitBars({
  accentColor,
  splits,
}: {
  accentColor: string;
  splits: TrendSplit[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {splits.slice(0, 4).map((split) => {
        const muted = split.total === 0 || split.type === "without_player";
        const width = split.total > 0 ? Math.max(split.hitRate, 8) : 24;

        return (
          <div
            key={`${split.type}-${split.label}`}
            className="rounded-2xl border border-dark-border/70 bg-dark-bg/55 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-gray-400">{split.label}</span>
              <span className={`shrink-0 font-semibold ${muted ? "text-gray-500" : "text-white"}`}>
                {formatRate(split)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div
                className={`h-full rounded-full ${muted ? "bg-gray-600/70" : ""}`}
                style={{
                  width: `${Math.min(width, 100)}%`,
                  backgroundColor: muted ? undefined : accentColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
