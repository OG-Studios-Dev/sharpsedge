"use client";

import type { SoccerMatch } from "@/lib/soccer-api";
import TeamLogo from "@/components/TeamLogo";
import { formatOdds } from "@/lib/edge-engine";

function leagueLabel(league: SoccerMatch["league"]) {
  return league === "SERIE_A" ? "Serie A" : "EPL";
}

function kickoffLabel(date: string) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SoccerMatchCard({ match }: { match: SoccerMatch }) {
  const isScored = match.score.home !== null || match.score.away !== null;
  const showHalfTime = match.score.halfTimeHome !== null && match.score.halfTimeAway !== null;

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300">
            {leagueLabel(match.league)}
          </span>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
            <span>{match.minute || match.status}</span>
            {match.minute && <span className="text-gray-600">•</span>}
            <span>{match.minute ? match.statusDetail : kickoffLabel(match.date)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold text-white">{match.status}</div>
          {showHalfTime && (
            <div className="mt-1 text-[10px] text-gray-500">
              HT ({match.score.halfTimeHome}-{match.score.halfTimeAway})
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {[
          { team: match.awayTeam, score: match.score.away },
          { team: match.homeTeam, score: match.score.home },
        ].map(({ team, score }) => (
          <div key={`${match.id}-${team.id}`} className="flex items-center gap-3">
            <TeamLogo team={team.abbreviation || team.shortName} logo={team.logo} size={28} color={team.color} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{team.shortName || team.name}</div>
              <div className="text-[11px] text-gray-500">{team.abbreviation || team.name}</div>
            </div>
            {isScored && (
              <div className="text-lg font-semibold text-white">{score ?? "—"}</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Home</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {typeof match.bestThreeWay?.home?.odds === "number" ? formatOdds(match.bestThreeWay.home.odds) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Draw</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {typeof match.bestThreeWay?.draw?.odds === "number" ? formatOdds(match.bestThreeWay.draw.odds) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Away</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {typeof match.bestThreeWay?.away?.odds === "number" ? formatOdds(match.bestThreeWay.away.odds) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
