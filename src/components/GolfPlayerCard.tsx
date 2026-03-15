"use client";

import { GolfPlayer } from "@/lib/types";

function formatOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function pct(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function probability(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function signedProbability(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const percent = value * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export default function GolfPlayerCard({ player }: { player: GolfPlayer }) {
  const oddsLabel = formatOdds(player.outrightOdds);
  const hasRates = player.hitRates && (player.hitRates.top5 || player.hitRates.top10 || player.hitRates.top20);

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface/70 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {player.image ? (
          <img src={player.image} alt={player.name} className="h-9 w-9 rounded-full border border-dark-border object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-bg text-sm">⛳</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate">{player.name}</span>
            <span className="text-[10px] text-gray-500">{player.position}</span>
          </div>
          <div className="flex items-center gap-2 text-xs mt-0.5">
            <span className={player.score.startsWith("-") ? "font-semibold text-emerald-400" : player.score.startsWith("+") ? "text-red-400" : "text-white"}>
              {player.score}
            </span>
            <span className="text-gray-500">Today {player.todayScore}</span>
          </div>
        </div>
        {oddsLabel && (
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
            {oddsLabel}
          </span>
        )}
      </div>

      {/* Compact hit rates row */}
      {hasRates && (
        <div className="flex gap-2 mt-2">
          <span className="text-[10px] text-gray-500">T5 <span className="text-white font-semibold">{pct(player.hitRates?.top5)}</span></span>
          <span className="text-[10px] text-gray-500">T10 <span className="text-white font-semibold">{pct(player.hitRates?.top10)}</span></span>
          <span className="text-[10px] text-gray-500">T20 <span className="text-white font-semibold">{pct(player.hitRates?.top20)}</span></span>
          <span className="text-[10px] text-gray-500">Cut <span className="text-white font-semibold">{pct(player.hitRates?.madeCut)}</span></span>
        </div>
      )}

      {(typeof player.modelProb === "number" || typeof player.courseFitScore === "number") && (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          {typeof player.modelProb === "number" && (
            <span className="rounded-full bg-dark-bg/60 px-2 py-0.5 text-gray-300">Win {probability(player.modelProb)}</span>
          )}
          {typeof player.courseFitScore === "number" && (
            <span className="rounded-full bg-dark-bg/60 px-2 py-0.5 text-gray-300">Course Fit {Math.round(player.courseFitScore)}/100</span>
          )}
          {typeof player.edge === "number" && (
            <span className={`rounded-full px-2 py-0.5 ${(player.edge ?? 0) > 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-dark-bg/60 text-gray-400"}`}>
              Edge {signedProbability(player.edge)}
            </span>
          )}
        </div>
      )}

      {/* Recent form compact */}
      {player.recentForm && player.recentForm.length > 0 && (
        <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-hide">
          {player.recentForm.slice(0, 5).map((r) => (
            <span key={`${player.id}-${r.tournamentId}`} className="shrink-0 text-[9px] text-gray-400 bg-dark-bg/60 rounded px-1.5 py-0.5">
              {r.finish}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
