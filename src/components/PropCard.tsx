import { PlayerProp } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import SavePickButton from "./SavePickButton";
import TrendBadge, { computeBadgeLevel } from "./TrendBadge";
import { formatOdds } from "@/lib/edge-engine";

function EdgeBadge({ edgePct }: { edgePct: number | null | undefined }) {
  if (!edgePct) return null;
  if (edgePct > 0.10)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold">
        STRONG EDGE
      </span>
    );
  if (edgePct > 0.05)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-semibold">
        EDGE
      </span>
    );
  if (edgePct > 0.03)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 font-semibold">
        LEAN
      </span>
    );
  return null;
}

export default function PropCard({ prop }: { prop: PlayerProp }) {
  return (
    <div className="mx-3 my-3 rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
      {/* Header: player + matchup */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TeamLogo team={prop.team} color={prop.teamColor} />
          <div>
            <div className="text-white font-bold text-base leading-tight">{prop.playerName}</div>
            <div className="text-gray-500 text-[12px] mt-0.5">
              {prop.team} {prop.isAway ? "@" : "vs"} {prop.opponent}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Prop type badge */}
          <span className="bg-dark-bg border border-dark-border text-gray-300 text-[11px] px-2 py-0.5 rounded-full">
            {prop.propType}
          </span>
          <EdgeBadge edgePct={prop.edgePct} />
          <TrendBadge level={computeBadgeLevel(prop.hitRate, prop.recentGames, prop.line, prop.direction || prop.overUnder)} />
        </div>
      </div>

      {/* Line + direction + odds */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-white text-xl font-bold">
          {prop.overUnder} {prop.line}
        </span>
        <span className="text-gray-400 text-sm font-medium">
          {formatOdds(prop.odds)}
        </span>
      </div>

      {/* Stats row: L5 / L10 / Hit rate */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="bg-dark-bg/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">L5 avg</div>
          <div className="text-white text-sm font-semibold mt-0.5">
            {prop.rollingAverages?.last5 ?? "-"}
          </div>
        </div>
        <div className="bg-dark-bg/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">L10 avg</div>
          <div className="text-white text-sm font-semibold mt-0.5">
            {prop.rollingAverages?.last10 ?? "-"}
          </div>
        </div>
        <div className="bg-dark-bg/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Hit rate</div>
          <div className="text-white text-sm font-semibold mt-0.5">
            {prop.fairProbability != null ? `${Math.round(prop.fairProbability * 100)}%` : "-"}
          </div>
        </div>
      </div>

      {/* Splits */}
      {prop.splits.length > 0 && (
        <div className="mt-3 space-y-0.5">
          {prop.splits.map((split, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-[12px] text-gray-400 leading-tight truncate">
                {split.label}
              </span>
              <span className={`text-[12px] font-semibold shrink-0 ${
                split.hitRate >= 70 ? "text-emerald-400" : split.hitRate >= 50 ? "text-white" : "text-red-400"
              }`}>
                {split.hitRate}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recent games sparkline */}
      {prop.recentGames && prop.recentGames.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Last 5 games</div>
          <div className="flex gap-1.5 items-center">
            {prop.recentGames.slice(0, 5).map((value, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                  value > prop.line
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-dark-bg text-gray-500 border border-dark-border"
                }`}
              >
                {value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning */}
      {prop.reasoning && (
        <p className="mt-3 text-[12px] leading-relaxed text-gray-400 line-clamp-2">
          {prop.reasoning}
        </p>
      )}

      {/* Footer: source tag + save */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          {prop.statsSource === "live-nhl" && prop.book === "Model Line"
            ? "Model Line \u2022 NHL API"
            : prop.book
              ? prop.book
              : ""}
        </span>
        <SavePickButton prop={prop} />
      </div>
    </div>
  );
}
