import { Flame, DollarSign, Lock, Wind, TrendingUp, type LucideProps } from "lucide-react";
import { TrendIndicator } from "@/lib/types";
import { hasIndicator } from "@/lib/player-trend";

const INDICATOR_CONFIG: Array<{
  type: TrendIndicator["type"];
  Icon: React.ComponentType<LucideProps>;
  label: string;
  activeClass: string;
}> = [
  { type: "goose_lean", Icon: TrendingUp, label: "Goose Lean", activeClass: "border-amber-400/40 bg-amber-400/15 text-amber-200" },
  { type: "hot", Icon: Flame, label: "Hot", activeClass: "border-red-400/40 bg-red-400/15 text-red-200" },
  { type: "money", Icon: DollarSign, label: "Money", activeClass: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" },
  { type: "lock", Icon: Lock, label: "Lock", activeClass: "border-accent-blue/40 bg-accent-blue/15 text-blue-100" },
  { type: "streak", Icon: Wind, label: "On a Run", activeClass: "border-purple-400/40 bg-purple-400/15 text-purple-200" },
];

export default function TrendIndicatorDots({
  indicators,
  size = "md",
}: {
  indicators?: TrendIndicator[];
  size?: "sm" | "md";
}) {
  const iconSize = size === "sm" ? 12 : 14;
  const dimensions = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  const activeIndicators = INDICATOR_CONFIG.filter((ind) => hasIndicator(indicators, ind.type));

  if (activeIndicators.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {activeIndicators.map((indicator) => (
        <div
          key={indicator.type}
          title={indicator.label}
          className={`inline-flex items-center justify-center rounded-full border transition-colors ${dimensions} ${indicator.activeClass}`}
        >
          <indicator.Icon size={iconSize} />
        </div>
      ))}
    </div>
  );
}
