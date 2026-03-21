import Link from "next/link";
import TeamLogo from "./TeamLogo";
import TrendIndicatorDots from "./TrendIndicatorDots";
import TrendSplitBars from "./TrendSplitBars";
import { PlayerProp } from "@/lib/types";
import { formatTrendOdds, getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import { getTeamHref } from "@/lib/drill-down";

export default function TrendPropCard({ prop }: { prop: PlayerProp }) {
  return (
    <Link
      href={getPlayerTrendHrefFromProp(prop)}
      className="tap-card block h-full overflow-hidden rounded-2xl border border-dark-border bg-[linear-gradient(180deg,rgba(21,24,33,0.96)_0%,rgba(12,16,24,0.98)_100%)] shadow-[0_14px_40px_rgba(0,0,0,0.22)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-gray-600"
    >
      <div className="h-1 w-full" style={{ background: prop.teamColor }} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <TeamLogo team={prop.team} color={prop.teamColor} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="card-title truncate">{prop.playerName}</div>
                <div className="mt-1 text-xs text-gray-500">
                  <Link href={getTeamHref(prop.team, prop.league)} onClick={(e) => e.stopPropagation()} className="hover:text-gray-300 transition-colors">{prop.team}</Link>
                  {prop.isAway ? " @ " : " vs "}
                  <Link href={getTeamHref(prop.opponent, prop.league)} onClick={(e) => e.stopPropagation()} className="hover:text-gray-300 transition-colors">{prop.opponent}</Link>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2.5 py-1 text-[11px] font-semibold text-gray-200">
                    {prop.overUnder} {prop.line} {prop.propType}
                  </span>
                  {formatTrendOdds(prop.odds) && (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                      {formatTrendOdds(prop.odds)}
                    </span>
                  )}
                </div>
              </div>
              <TrendIndicatorDots indicators={prop.indicators} size="sm" />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <TrendSplitBars accentColor={prop.teamColor} splits={prop.splits} />
        </div>
      </div>
    </Link>
  );
}
