import { TeamTrend } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendBadge, { computeTeamBadgeLevel } from "./TrendBadge";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";

export default function TeamTrendCard({ trend }: { trend: TeamTrend }) {
  return (
    <div className="border-b border-dark-border/40 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TeamLogo team={trend.team} color={trend.teamColor} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold text-[15px]">{trend.team}</span>
              <span className="text-gray-500 text-[13px]">
                {trend.isAway ? "@" : "vs"} {trend.opponent}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-gray-300 text-[14px]">
                {trend.betType}
              </span>
              <span className="text-gray-400 text-[13px] font-medium">
                {trend.odds === -110 ? <span className="text-gray-600">N/A</span> : formatOdds(trend.odds)}
              </span>
              {trend.book && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-dark-surface text-gray-500">
                  {trend.book}
                </span>
              )}
            </div>
          </div>
        </div>
        <TrendBadge level={computeTeamBadgeLevel(trend.hitRate, trend.betType)} />
      </div>

      <div className="mt-3 space-y-0.5">
        {trend.splits.map((split, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-0.5">
            <span className="text-[13px] text-gray-400 leading-tight">
              &bull; {split.label}
            </span>
            {split.hitRate > 0 && split.hitRate <= 100 && (
              <span className={`text-[13px] font-semibold shrink-0 ${getHitRateColor(split.hitRate)}`}>
                {split.hitRate}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
