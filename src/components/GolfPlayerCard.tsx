"use client";

import { GolfPlayer } from "@/lib/types";

function formatOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function hitRateLabel(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function statLabel(value?: number | null, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 10 ? 1 : 2)}${suffix}`;
}

export default function GolfPlayerCard({ player }: { player: GolfPlayer }) {
  return (
    <article className="rounded-2xl border border-dark-border bg-dark-surface/80 p-4">
      <div className="flex items-start gap-3">
        {player.image ? (
          <img src={player.image} alt={player.name} className="h-14 w-14 rounded-2xl border border-dark-border object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dark-border bg-dark-bg text-lg">⛳</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="truncate text-base font-semibold text-white">{player.name}</h3>
            <span className="rounded-full border border-dark-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gray-400">
              {player.position || "Field"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className={player.score.startsWith("-") ? "font-semibold text-emerald-400" : player.score.startsWith("+") ? "font-semibold text-red-400" : "font-semibold text-white"}>
              {player.score}
            </span>
            <span className="text-gray-500">Today {player.todayScore}</span>
            <span className="text-gray-500">{player.thru || player.teeTime || "—"}</span>
          </div>
        </div>
        {formatOdds(player.outrightOdds) && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Outright</div>
            <div className="mt-0.5 text-sm font-semibold text-white">{formatOdds(player.outrightOdds)}</div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-300 sm:grid-cols-4">
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Top 5</div>
          <div className="mt-1 text-sm font-semibold text-white">{hitRateLabel(player.hitRates?.top5)}</div>
        </div>
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Top 10</div>
          <div className="mt-1 text-sm font-semibold text-white">{hitRateLabel(player.hitRates?.top10)}</div>
        </div>
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Top 20</div>
          <div className="mt-1 text-sm font-semibold text-white">{hitRateLabel(player.hitRates?.top20)}</div>
        </div>
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Make Cut</div>
          <div className="mt-1 text-sm font-semibold text-white">{hitRateLabel(player.hitRates?.madeCut)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Recent Form</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(player.recentForm ?? []).slice(0, 5).map((result) => (
              <span key={`${player.id}-${result.tournamentId}`} className="rounded-full border border-dark-border/50 bg-dark-bg/40 px-2.5 py-1 text-[11px] text-gray-300">
                {result.finish} · {result.tournamentName}
              </span>
            ))}
            {(player.recentForm ?? []).length === 0 && (
              <span className="text-xs text-gray-500">No recent tournament results loaded.</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Course History</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(player.courseHistory ?? []).slice(0, 3).map((result) => (
              <span key={`${player.id}-course-${result.tournamentId}`} className="rounded-full border border-dark-border/50 bg-dark-bg/40 px-2.5 py-1 text-[11px] text-gray-300">
                {result.finish} · {result.score}
              </span>
            ))}
            {(player.courseHistory ?? []).length === 0 && (
              <span className="text-xs text-gray-500">No course history found for this venue.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-300 sm:grid-cols-4">
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Scoring Avg</div>
          <div className="mt-1 text-sm font-semibold text-white">{statLabel(player.seasonStats?.scoringAverage)}</div>
        </div>
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Drive Acc</div>
          <div className="mt-1 text-sm font-semibold text-white">{statLabel(player.seasonStats?.drivingAccuracy, "%")}</div>
        </div>
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">GIR</div>
          <div className="mt-1 text-sm font-semibold text-white">{statLabel(player.seasonStats?.gir, "%")}</div>
        </div>
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Putting</div>
          <div className="mt-1 text-sm font-semibold text-white">{statLabel(player.seasonStats?.puttingAverage)}</div>
        </div>
      </div>
    </article>
  );
}
