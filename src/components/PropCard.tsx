import { PlayerProp } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import TrendIndicators from "./TrendIndicators";
import SavePickButton from "./SavePickButton";
import { formatOdds, getHitRateColor } from "@/lib/edge-engine";

export default function PropCard({ prop }: { prop: PlayerProp }) {
  return (
    <div className="mx-3 my-3 rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
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
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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
              {typeof prop.confidence === "number" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                  {prop.confidence}% confidence
                </span>
              )}
              {("edgeTier" in prop) && (prop as any).edgeTier && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Tier {(prop as any).edgeTier}
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
            {prop.reasoning && (
              <p className="mt-2 text-[12px] leading-relaxed text-gray-400 max-w-[280px]">
                {prop.reasoning}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
              {prop.projection !== undefined && prop.projection !== null && (
                <span>Proj: {prop.projection}</span>
              )}
              {prop.fairOdds !== undefined && prop.fairOdds !== null && (
                <span>Fair: {prop.fairOdds > 0 ? `+${prop.fairOdds}` : prop.fairOdds}</span>
              )}
              {prop.edgePct !== undefined && prop.edgePct !== null && (
                <span>Edge: {prop.edgePct > 0 ? `+${prop.edgePct}` : prop.edgePct}%</span>
              )}
              {prop.rollingAverages && (
                <span>Avg L5: {prop.rollingAverages.last5 ?? "-"}</span>
              )}
              {prop.rollingAverages && (
                <span>Avg L10: {prop.rollingAverages.last10 ?? "-"}</span>
              )}
              <span>{prop.isBackToBack ? "Back-to-back" : "Rest advantage"}</span>
              {prop.statsSource && <span>{prop.statsSource === "live-nhl" ? "Live NHL model" : "Seed model"}</span>}
            </div>
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

      {prop.recentGames && prop.recentGames.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Recent results</div>
          <div className="flex gap-1.5 items-end h-10">
            {prop.recentGames.slice(0, 10).map((value, i) => (
              <div key={i} className="flex-1 rounded-t bg-accent-blue/40" style={{ height: `${Math.max(20, value * 10)}%` }} />
            ))}
          </div>
        </div>
      )}

      <SavePickButton prop={prop} />
    </div>
  );
}
