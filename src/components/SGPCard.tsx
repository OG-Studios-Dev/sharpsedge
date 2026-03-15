import { SGP } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendIndicators from "./TrendIndicators";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";

export default function SGPCard({ sgp }: { sgp: SGP }) {
  const trackedSplit = sgp.splits[0];

  return (
    <div className="overflow-hidden rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,rgba(21,24,33,0.96)_0%,rgba(12,16,24,0.98)_100%)] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{sgp.league}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{sgp.matchup}</h3>
          <p className="text-[12px] text-gray-400 mt-1">
            {(sgp.legCount ?? sgp.legs.length)}-leg same-game parlay
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <TrendIndicators indicators={sgp.indicators} />
          {typeof sgp.combinedHitRate === "number" && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/80">Combined Hit Rate</div>
              <div className="mt-1 text-xl font-semibold text-emerald-200">{sgp.combinedHitRate.toFixed(1)}%</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {sgp.legs.map((leg, i) => (
          <div key={i} className="rounded-2xl border border-dark-border/70 bg-dark-bg/45 px-3 py-3">
            <div className="flex items-start gap-2.5">
              <TeamLogo team={leg.team} color={leg.teamColor} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-[13px] leading-5">
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
                  {typeof leg.hitRate === "number" && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getHitRateColor(leg.hitRate)} border-current/20`}>
                      {Math.round(leg.hitRate)}% hit
                    </span>
                  )}
                  {typeof leg.hits === "number" && typeof leg.total === "number" && leg.total > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-dark-border text-gray-400">
                      {leg.hits}/{leg.total} tracked
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {trackedSplit && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-dark-border/80 bg-dark-bg/55 px-3 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Tracked Sample</div>
            <div className="mt-1 text-sm font-medium text-white">{trackedSplit.label}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Hit Rate</div>
            <div className="mt-1 text-base font-semibold text-white">{Math.round(trackedSplit.hitRate)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
