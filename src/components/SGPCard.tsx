import { SGP } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendIndicators from "./TrendIndicators";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";

export default function SGPCard({ sgp }: { sgp: SGP }) {
  return (
    <div className="border-b border-dark-border/40 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-[15px] tracking-wide">{sgp.matchup}</h3>
        <TrendIndicators indicators={sgp.indicators} />
      </div>

      <div className="space-y-2">
        {sgp.legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <TeamLogo team={leg.team} color={leg.teamColor} size={28} />
            <span className="text-white text-[13px]">
              <span className="font-semibold">{leg.playerName}:</span>
              {" "}{leg.overUnder} {leg.line} {leg.propType}
              {" "}<span className="text-gray-500">{formatOdds(leg.odds)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-0.5">
        {sgp.splits.map((split, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-0.5">
            <span className="text-[13px] text-gray-400 leading-tight">
              &bull; {split.label}
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
