import { SGP } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendIndicatorDots from "./TrendIndicatorDots";
import { formatOdds } from "@/lib/edge-engine";
import { Layers, Activity } from "lucide-react";

function getHitRateColor(hitRate: number): string {
  if (hitRate >= 80) return "text-accent-green";
  if (hitRate >= 60) return "text-accent-yellow";
  return "text-accent-red";
}

export default function SGPCard({ sgp }: { sgp: SGP }) {
  const trackedSplit = sgp.splits[0];

  return (
    <div className="mx-3 my-3 rounded-3xl bg-dark-card border-l-[3px] border-l-accent-blue border-y border-r border-y-dark-border/80 border-r-dark-border/80 overflow-hidden shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-1 hover:shadow-[0_12px_40px_-15px_rgba(74,158,255,0.2)] transition-all duration-300">
      <div className="px-5 py-4 border-b border-dark-border/40 bg-gradient-to-r from-dark-surface/50 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Layers size={14} className="text-accent-blue opacity-50" />
              <p className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/50">{sgp.league} • {(sgp.legCount ?? sgp.legs.length)}-LEG SGP</p>
            </div>
            <h3 className="text-xl font-heading font-black text-text-platinum tracking-tight">{sgp.matchup}</h3>
          </div>
          <div className="flex flex-col items-end gap-2">
            <TrendIndicatorDots indicators={sgp.indicators} />
            {typeof sgp.combinedHitRate === "number" && (
              <div className="text-right mt-1">
                <div className="text-[9px] uppercase tracking-widest text-text-platinum/40 font-semibold mb-0.5">Engine Hit Rate</div>
                <div className="text-2xl font-mono font-black text-accent-green drop-shadow-[0_0_12px_rgba(34,197,94,0.3)] leading-none">{sgp.combinedHitRate.toFixed(1)}%</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {sgp.legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-dark-border/30 last:border-0 group">
            <div className="flex items-center gap-3">
              <TeamLogo team={leg.team} color={leg.teamColor} size={32} />
              <div>
                <p className="text-text-platinum font-sans text-sm font-semibold group-hover:text-white transition-colors">
                  {leg.playerName}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-text-platinum/50 font-mono tracking-wide">
                    {leg.overUnder} {leg.line} {leg.propType}
                  </span>
                  {typeof leg.odds === "number" && (
                     <span className="text-[10px] px-1.5 py-0.5 rounded border border-dark-border/80 bg-dark-bg/50 text-text-platinum/40 font-mono">
                       {formatOdds(leg.odds)}
                     </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              {typeof leg.hitRate === "number" && (
                <div className={`text-base font-mono font-bold ${getHitRateColor(leg.hitRate)}`}>
                  {Math.round(leg.hitRate)}%
                </div>
              )}
              {typeof leg.hits === "number" && typeof leg.total === "number" && leg.total > 0 && (
                <div className="text-[9px] text-text-platinum/40 font-mono tracking-wider mt-0.5">
                  {leg.hits}/{leg.total}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {trackedSplit && (
        <div className="px-5 py-3 bg-dark-bg/60 border-t border-dark-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-text-platinum/40" />
            <span className="text-[11px] text-text-platinum/60 font-sans">{trackedSplit.label}</span>
          </div>
          <div className="text-[12px] font-mono font-bold text-text-platinum">
            {Math.round(trackedSplit.hitRate)}% Tracked
          </div>
        </div>
      )}
    </div>
  );
}
