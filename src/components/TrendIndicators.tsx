import { TrendIndicator } from "@/lib/types";

const iconMap: Record<string, { icon: string; label: string }> = {
  hot: { icon: "⚡", label: "Hot streak" },
  vs_opponent: { icon: "🆚", label: "vs Opponent" },
  home_away: { icon: "🏠", label: "Home/Away" },
  without_player: { icon: "✖", label: "Without player" },
};

export default function TrendIndicators({ indicators }: { indicators?: TrendIndicator[] }) {
  if (!indicators || indicators.length === 0) return null;
  
  const active = indicators.filter((i) => i.active);
  
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {active.map((ind, i) => {
        const config = iconMap[ind.type] || { icon: "•", label: ind.type };
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
