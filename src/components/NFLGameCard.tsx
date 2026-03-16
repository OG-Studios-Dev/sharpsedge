"use client";

import type { NFLGame } from "@/lib/nfl-api";
import TeamLogo from "@/components/TeamLogo";
import { formatOdds } from "@/lib/edge-engine";

export default function NFLGameCard({ game }: { game: NFLGame }) {
  const isScored = game.homeScore !== null || game.awayScore !== null;

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-300">{game.week || "NFL"}</div>
          <div className="mt-1 text-[11px] text-gray-500">{game.quarter ? `${game.quarter} ${game.clock || ""}`.trim() : game.status}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold text-white">{game.status}</div>
          <div className="mt-1 text-[10px] text-gray-500">{game.statusDetail}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {[
          { team: game.awayTeam, score: game.awayScore },
          { team: game.homeTeam, score: game.homeScore },
        ].map(({ team, score }) => (
          <div key={`${game.id}-${team.id}`} className="flex items-center gap-3">
            <TeamLogo team={team.abbreviation} logo={team.logo} size={28} color={team.color} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{team.fullName}</div>
              <div className="text-[11px] text-gray-500">{team.record || team.abbreviation}</div>
            </div>
            {isScored && (
              <div className="text-lg font-semibold text-white">{score ?? "—"}</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Spread</div>
          <div className="mt-1 text-sm font-semibold text-white">{game.spread || "—"}</div>
        </div>
        <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Total</div>
          <div className="mt-1 text-sm font-semibold text-white">{typeof game.overUnder === "number" ? game.overUnder.toFixed(1) : "—"}</div>
        </div>
        <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">ML</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {typeof game.awayML === "number" && typeof game.homeML === "number"
              ? `${formatOdds(game.awayML)} / ${formatOdds(game.homeML)}`
              : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
