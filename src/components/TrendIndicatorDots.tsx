import { TrendIndicator } from "@/lib/types";
import { hasIndicator } from "@/lib/player-trend";

const INDICATOR_CONFIG: Array<{
  type: TrendIndicator["type"];
  icon: string;
  label: string;
  activeClass: string;
}> = [
  { type: "goose_lean", icon: "🪿", label: "Goose Lean", activeClass: "border-amber-400/40 bg-amber-400/15 text-amber-200" },
  { type: "hot", icon: "🔥", label: "Hot", activeClass: "border-red-400/40 bg-red-400/15 text-red-200" },
  { type: "money", icon: "🤑", label: "Money", activeClass: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" },
  { type: "lock", icon: "🔒", label: "Lock", activeClass: "border-accent-blue/40 bg-accent-blue/15 text-blue-100" },
];

export default function TrendIndicatorDots({
  indicators,
  size = "md",
}: {
  indicators?: TrendIndicator[];
  size?: "sm" | "md";
}) {
  const dimensions = size === "sm" ? "h-8 w-8 text-[13px]" : "h-9 w-9 text-sm";

  return (
    <div className="flex items-center gap-1.5">
      {INDICATOR_CONFIG.map((indicator) => {
        const active = hasIndicator(indicators, indicator.type);
        return (
          <div
            key={indicator.type}
            title={indicator.label}
            className={`inline-flex items-center justify-center rounded-full border transition-colors ${dimensions} ${
              active
                ? indicator.activeClass
                : "border-dark-border bg-dark-bg/70 text-gray-600"
            }`}
          >
            {indicator.icon}
          </div>
        );
      })}
    </div>
  );
}
