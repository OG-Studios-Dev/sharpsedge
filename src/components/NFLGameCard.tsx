"use client";

import type { NFLGame } from "@/lib/nfl-api";
import TeamLogo from "@/components/TeamLogo";
import { formatOdds } from "@/lib/edge-engine";
import { shouldShowNFLScore } from "@/lib/nfl-game-display";

export default function NFLGameCard({ game }: { game: NFLGame }) {
  const isScored = shouldShowNFLScore(game);
  const statusDetail = game.statusDetail && game.statusDetail !== game.status ? game.statusDetail : null;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface/90 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${game.quarter ? "text-emerald-400" : "text-gray-400"}`}>
          {game.quarter ? `${game.quarter} ${game.clock || ""}`.trim() : game.status}
        </div>
        {statusDetail ? <div className="truncate text-right text-[10px] text-gray-600">{statusDetail}</div> : null}
      </div>

      <div className="mt-2.5 space-y-2">
        {[
          { team: game.awayTeam, score: game.awayScore },
          { team: game.homeTeam, score: game.homeScore },
        ].map(({ team, score }) => (
          <div key={`${game.id}-${team.id}`} className="flex items-center gap-2.5">
            <TeamLogo team={team.abbreviation} logo={team.logo} size={24} color={team.color} sport="NFL" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white">{team.fullName}</div>
              <div className="text-[10px] text-gray-600">{team.record || team.abbreviation}</div>
            </div>
            {isScored ? <div className="text-base font-semibold tabular-nums text-white">{score ?? "—"}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg border border-dark-border/60 bg-dark-bg/60 px-1.5 py-1.5">
          <div className="text-[8px] uppercase tracking-[0.14em] text-gray-600">Spread</div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-white">{game.spread || "—"}</div>
        </div>
        <div className="rounded-lg border border-dark-border/60 bg-dark-bg/60 px-1.5 py-1.5">
          <div className="text-[8px] uppercase tracking-[0.14em] text-gray-600">Total</div>
          <div className="mt-0.5 text-[11px] font-semibold text-white">{typeof game.overUnder === "number" ? game.overUnder.toFixed(1) : "—"}</div>
        </div>
        <div className="rounded-lg border border-dark-border/60 bg-dark-bg/60 px-1.5 py-1.5">
          <div className="text-[8px] uppercase tracking-[0.14em] text-gray-600">ML</div>
          <div className="mt-0.5 truncate text-[10px] font-semibold text-white">
            {typeof game.awayML === "number" && typeof game.homeML === "number"
              ? `${formatOdds(game.awayML)} / ${formatOdds(game.homeML)}`
              : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
