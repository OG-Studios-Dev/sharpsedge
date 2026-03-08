import { PlayerProp } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendIndicators from "./TrendIndicators";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";

export default function PropCard({ prop }: { prop: PlayerProp }) {
  return (
    <div className="border-b border-dark-border/40 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TeamLogo team={prop.team} color={prop.teamColor} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold text-[15px]">{prop.playerName}</span>
              <span className="text-gray-500 text-[13px]">
                {prop.isAway ? "@" : "vs"} {prop.opponent}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-gray-300 text-[14px]">
                {prop.overUnder} {prop.line} {prop.propType}
              </span>
              <span className="text-gray-400 text-[13px] font-medium">
                {formatOdds(prop.odds)}
              </span>
              {prop.book && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-dark-surface text-gray-500">
                  {prop.book}
                </span>
              )}
            </div>
            {prop.edge !== undefined && prop.edge > 0 && (
              <div className="mt-1">
                <span className="text-[11px] text-emerald-400 font-medium">
                  +{prop.edge}% edge
                </span>
              </div>
            )}
          </div>
        </div>
        <TrendIndicators indicators={prop.indicators} />
      </div>

      <div className="mt-3 space-y-0.5">
        {prop.splits.map((split, i) => (
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
