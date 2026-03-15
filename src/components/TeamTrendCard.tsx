import { TeamTrend } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import { formatOdds } from "@/lib/edge-engine";
import TrendIndicatorDots from "./TrendIndicatorDots";
import TrendSplitBars from "./TrendSplitBars";

export default function TeamTrendCard({ trend }: { trend: TeamTrend }) {
  return (
    <div className="mx-3 my-3 overflow-hidden rounded-[26px] border border-dark-border bg-[linear-gradient(180deg,rgba(21,24,33,0.96)_0%,rgba(12,16,24,0.98)_100%)] shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
      <div className="h-1 w-full" style={{ background: trend.teamColor }} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <TeamLogo team={trend.team} color={trend.teamColor} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white">{trend.team}</div>
                <div className="mt-1 text-[12px] text-gray-500">
                  {trend.team} {trend.isAway ? "@" : "vs"} {trend.opponent}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2.5 py-1 text-[11px] font-semibold text-gray-200">
                    {trend.betType}
                  </span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    {trend.odds === -110 ? "Model" : formatOdds(trend.odds)}
                  </span>
                  {trend.book && (
                    <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2.5 py-1 text-[11px] text-gray-400">
                      {trend.book}
                    </span>
                  )}
                </div>
              </div>
              <TrendIndicatorDots indicators={trend.indicators} size="sm" />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <TrendSplitBars accentColor={trend.teamColor} splits={trend.splits} />
        </div>
      </div>
    </div>
  );
}
