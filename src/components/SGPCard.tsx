import { SGP } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendIndicators from "./TrendIndicators";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";

export default function SGPCard({ sgp }: { sgp: SGP }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-white font-bold text-[15px] tracking-wide">{sgp.matchup}</h3>
          <p className="text-[11px] text-gray-500 mt-1">
            {(sgp.legCount ?? sgp.legs.length)}-leg SGP
            {typeof sgp.combinedHitRate === "number" ? ` · ${sgp.combinedHitRate.toFixed(1)}% combined hit rate` : ""}
          </p>
        </div>
        <TrendIndicators indicators={sgp.indicators} />
      </div>

      <div className="space-y-2.5">
        {sgp.legs.map((leg, i) => (
          <div key={i} className="rounded-xl border border-dark-border/70 bg-dark-bg/40 px-3 py-2.5">
            <div className="flex items-start gap-2.5">
            <TeamLogo team={leg.team} color={leg.teamColor} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-[13px]">
                  <span className="font-semibold">{leg.playerName}</span>
                  {" "}{leg.overUnder} {leg.line} {leg.propType}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-500">
                    {leg.opponent ? `${leg.team} vs ${leg.opponent}` : leg.team}
                  </span>
                  {typeof leg.odds === "number" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-gray-300">
                      {formatOdds(leg.odds)}
                    </span>
                  )}
                  {typeof leg.hitRate === "number" && typeof leg.hits === "number" && typeof leg.total === "number" && leg.total > 0 && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getHitRateColor(leg.hitRate)} border-current/20`}>
                      {leg.hits}/{leg.total}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {typeof sgp.combinedHitRate === "number" && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
          <span className="text-[11px] text-emerald-300 font-medium">Combined confidence</span>
          <span className="text-sm font-semibold text-emerald-200">
            {sgp.combinedHitRate.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
