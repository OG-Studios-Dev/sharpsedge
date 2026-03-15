import Link from "next/link";
import TeamLogo from "./TeamLogo";
import TrendIndicatorDots from "./TrendIndicatorDots";
import TrendSplitBars from "./TrendSplitBars";
import { PlayerProp } from "@/lib/types";
import { formatTrendOdds, getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import { ChevronRight } from "lucide-react";

export default function TrendPropCard({ prop }: { prop: PlayerProp }) {
  return (
    <Link
      href={getPlayerTrendHrefFromProp(prop)}
      className="mx-3 my-3 block overflow-hidden rounded-[24px] border border-dark-border/80 bg-dark-card shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_12px_40px_-15px_rgba(74,158,255,0.15)] group relative"
    >
      <div className="absolute top-0 left-0 bottom-0 w-1 transition-opacity duration-300 opacity-80 group-hover:opacity-100" style={{ background: prop.teamColor }} />
      <div className="p-5 pl-6">
        <div className="flex items-start gap-4 mb-4">
          <TeamLogo team={prop.team} color={prop.teamColor} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-heading font-bold text-text-platinum group-hover:text-accent-blue transition-colors">
                  {prop.playerName}
                </div>
                <div className="mt-0.5 text-[11px] font-sans text-text-platinum/50 font-semibold border border-dark-border/50 px-1.5 rounded inline-block bg-dark-bg/50">
                  {prop.team} {prop.isAway ? "@" : "vs"} {prop.opponent}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-accent-blue/10 border border-accent-blue/20 text-accent-blue px-2.5 py-0.5 font-mono text-[12px] font-bold shadow-[inset_0_0_10px_rgba(74,158,255,0.05)]">
                    {prop.overUnder} {prop.line} {prop.propType}
                  </span>
                  {formatTrendOdds(prop.odds) && (
                    <span className="rounded bg-dark-bg/50 border border-dark-border px-2 py-0.5 font-mono text-[11px] font-semibold text-text-platinum/70">
                      {formatTrendOdds(prop.odds)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-3 h-full justify-between">
            <TrendIndicatorDots indicators={prop.indicators} />
            <div className="w-6 h-6 rounded-full bg-dark-surface flex items-center justify-center text-text-platinum/40 group-hover:bg-accent-blue/20 group-hover:text-accent-blue group-hover:translate-x-1 transition-all">
              <ChevronRight size={14} strokeWidth={3} />
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-dark-border/40 pt-4">
          <TrendSplitBars accentColor={prop.teamColor} splits={prop.splits} />
        </div>
      </div>
    </Link>
  );
}
