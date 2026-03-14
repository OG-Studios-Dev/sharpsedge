import { TrendIndicator } from "@/lib/types";

export const TREND_ICON_MAP: Record<string, { icon: string; label: string }> = {
  goose_lean: { icon: "🪿", label: "Goose Lean" },
  hot: { icon: "🔥", label: "Hot" },
  money: { icon: "🤑", label: "Money" },
  lock: { icon: "🔒", label: "Lock" },
  streak: { icon: "💨", label: "On a Run" },
  vs_opponent: { icon: "🆚", label: "vs Opponent" },
  home_away: { icon: "🏠", label: "Home/Away" },
  without_player: { icon: "✖", label: "Without player" },
};

// Ordered list for filter pills
export const TREND_FILTER_OPTIONS = [
  { type: "all", icon: "🎯", label: "All" },
  { type: "goose_lean", icon: "🪿", label: "Goose Lean" },
  { type: "hot", icon: "🔥", label: "Hot" },
  { type: "money", icon: "🤑", label: "Money" },
  { type: "lock", icon: "🔒", label: "Lock" },
  { type: "streak", icon: "💨", label: "On a Run" },
] as const;

export default function TrendIndicators({ indicators }: { indicators?: TrendIndicator[] }) {
  if (!indicators || indicators.length === 0) return null;

  const active = indicators.filter((i) => i.active);

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {active.map((ind, i) => {
        const config = TREND_ICON_MAP[ind.type] || { icon: "•", label: ind.type };
        return (
          <div
            key={i}
            className="w-7 h-7 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center text-xs"
            title={config.label}
          >
            {config.icon}
          </div>
        );
      })}
    </div>
  );
}
