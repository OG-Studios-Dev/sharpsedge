import Link from "next/link";
import { Zap } from "lucide-react";
import { Parlay } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";
import { getTeamHref, getPlayerHref } from "@/lib/drill-down";

export default function ParlayCard({ parlay }: { parlay: Parlay }) {
  return (
    <div className="border-b border-dark-border/40 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-[15px]">{parlay.category}</h3>
        <div className="w-8 h-8 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center">
          <Zap size={14} className="text-accent-blue" />
        </div>
      </div>

      <div className="space-y-2">
        {parlay.legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Link href={getTeamHref(leg.team, leg.league || parlay.league)}>
              <TeamLogo team={leg.team} color={leg.teamColor} size={28} />
            </Link>
            <span className="text-white text-[13px]">
              <Link href={getPlayerHref(leg.playerId)} className="font-semibold hover:text-accent-blue transition-colors">{leg.playerName}</Link>:
              {" "}{leg.overUnder} {leg.line} {leg.propType}
              {" "}<span className="text-gray-500">{formatOdds(leg.odds)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-0.5">
        {parlay.splits.map((split, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-0.5">
            <span className="text-[13px] text-gray-400 leading-tight">
              {split.label}
            </span>
            <span className={`text-[13px] font-semibold shrink-0 ${getHitRateColor(split.hitRate)}`}>
              {split.hitRate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
