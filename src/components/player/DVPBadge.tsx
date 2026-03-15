"use client";

import { getDefenseRankTone, getDvpLabel, ordinal, rankToEdgeScore } from "@/lib/player-research";

type DVPBadgeProps = {
  opponent: string;
  position: string;
  statLabel: string;
  rank: number;
  teamCount: number;
};

function getToneClasses(rank: number, teamCount: number) {
  const tone = getDefenseRankTone(rank, teamCount);
  if (tone === "good") return "border-emerald-500/30 bg-emerald-500/12 text-emerald-100";
  if (tone === "neutral") return "border-amber-500/30 bg-amber-500/12 text-amber-100";
  return "border-red-500/30 bg-red-500/12 text-red-100";
}

export default function DVPBadge({ opponent, position, statLabel, rank, teamCount }: DVPBadgeProps) {
  const score = rankToEdgeScore(rank, teamCount);
  const label = getDvpLabel(rank, teamCount);

  return (
    <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">DVP Matchup</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-dark-bg/80">
          <div
            className="absolute inset-1 rounded-full"
            style={{
              background: `conic-gradient(rgba(16,185,129,0.95) ${score * 3.6}deg, rgba(39,43,54,0.85) 0deg)`,
            }}
          />
          <div className="relative flex h-[68px] w-[68px] items-center justify-center rounded-full bg-dark-surface text-xl font-semibold text-white">
            {score}
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {opponent} allows {ordinal(rank)} most {statLabel} to {position || "this role"}
          </p>
          <div className="mt-3">
            <span className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold ${getToneClasses(rank, teamCount)}`}>
              {label}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
