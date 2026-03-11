"use client";

import { useState } from "react";

export type BadgeLevel = "lock" | "goose" | "fire" | null;

const BADGE_CONFIG = {
  lock: {
    icon: "🔒",
    label: "Lock",
    desc: "100% hit rate in last 3+ games. Strongest possible trend.",
    bg: "bg-yellow-500/15 border-yellow-500/40",
  },
  goose: {
    icon: "🪿",
    label: "Strong Lean",
    desc: "80%+ hit rate in last 5 or 10 games. High-confidence trend.",
    bg: "bg-accent-blue/10 border-accent-blue/30",
  },
  fire: {
    icon: "🔥",
    label: "Hot Streak",
    desc: "3+ consecutive games hitting this prop. Active winning streak.",
    bg: "bg-orange-500/10 border-orange-500/30",
  },
} as const;

/**
 * Compute badge level from hit rate and optional recent games array + line.
 * Priority: lock > goose > fire > null
 */
export function computeBadgeLevel(
  hitRate?: number,
  recentGames?: number[],
  line?: number,
  direction?: "Over" | "Under"
): BadgeLevel {
  const hr = hitRate ?? 0;

  // Check consecutive streak from recentGames
  let streak = 0;
  if (recentGames?.length && line !== undefined && direction) {
    for (const v of recentGames) {
      const hit = direction === "Over" ? v > line : v < line;
      if (hit) streak++;
      else break;
    }
  }

  // Lock: 100% L5+ or 100% L10+ or 5+ consecutive
  if (hr === 100 || streak >= 5) return "lock";

  // Goose: 80%+ L10 or 4/5 in last 5
  if (hr >= 80) return "goose";

  // Check 4/5 in last 5 for goose
  if (recentGames?.length && recentGames.length >= 5 && line !== undefined && direction) {
    const last5 = recentGames.slice(0, 5);
    const hits = last5.filter((v) => direction === "Over" ? v > line : v < line).length;
    if (hits >= 4) return "goose";
  }

  // Fire: 3+ consecutive
  if (streak >= 3) return "fire";

  return null;
}

/**
 * Same as computeBadgeLevel but for team trends (no recentGames, just hitRate + betType)
 */
export function computeTeamBadgeLevel(hitRate?: number, betType?: string): BadgeLevel {
  const hr = hitRate ?? 0;
  if (hr === 100) return "lock";
  if (hr >= 80) return "goose";
  if (betType?.includes("Streak")) return "fire";
  return null;
}

interface TrendBadgeProps {
  level: BadgeLevel;
}

export default function TrendBadge({ level }: TrendBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!level) return null;

  const config = BADGE_CONFIG[level];

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setShowTooltip((v) => !v)}
        className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm transition-opacity ${config.bg}`}
        aria-label={config.label}
      >
        {config.icon}
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-9 z-50 w-52 bg-dark-card border border-dark-border rounded-xl p-3 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{config.icon}</span>
            <span className="text-white text-xs font-semibold">{config.label}</span>
          </div>
          <p className="text-gray-400 text-[11px] leading-snug">{config.desc}</p>
          <button
            onClick={() => setShowTooltip(false)}
            className="mt-2 text-[10px] text-accent-blue"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
