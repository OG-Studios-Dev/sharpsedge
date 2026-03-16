"use client";

import { useEffect, useState } from "react";
import type { SoccerLeague, SoccerTeamStanding } from "@/lib/soccer-api";
import TeamLogo from "@/components/TeamLogo";

function leagueLabel(league: SoccerLeague) {
  return league === "SERIE_A" ? "Serie A" : "EPL";
}

export default function SoccerStandingsTable({ league }: { league: SoccerLeague }) {
  const [standings, setStandings] = useState<SoccerTeamStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/soccer/standings?league=${league}`)
      .then((response) => response.json())
      .then((data) => {
        setStandings(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [league]);

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      <div className="mb-3">
        <h3 className="page-heading">{leagueLabel(league)} Table</h3>
        <p className="mt-0.5 text-[11px] text-gray-500">Champions League spots in green, relegation in red</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-dark-border/40" />
          ))}
        </div>
      ) : standings.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">No standings available right now</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-dark-border/60">
          <div className="grid grid-cols-[28px_1.2fr_repeat(7,_40px)] gap-1 border-b border-dark-border/50 bg-dark-bg/60 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500">
            <div className="text-center">Pos</div>
            <div>Team</div>
            <div className="text-center">P</div>
            <div className="text-center">W</div>
            <div className="text-center">D</div>
            <div className="text-center">L</div>
            <div className="text-center">GF</div>
            <div className="text-center">GA</div>
            <div className="text-center">GD</div>
            <div className="text-center">Pts</div>
          </div>

          {standings.map((team) => {
            const zoneClass = team.position <= 4
              ? "border-l-4 border-emerald-500"
              : team.position >= 18
                ? "border-l-4 border-red-500"
                : "border-l-4 border-transparent";

            return (
              <div
                key={`${league}-${team.team}`}
                className={`grid grid-cols-[28px_1.2fr_repeat(7,_40px)] gap-1 items-center border-b border-dark-border/30 px-3 py-2.5 last:border-b-0 ${zoneClass}`}
              >
                <div className="text-center text-xs text-gray-400">{team.position}</div>
                <div className="flex items-center gap-2 min-w-0">
                  <TeamLogo team={team.team} logo={team.logo} size={24} color={team.color} />
                  <span className="truncate text-xs font-medium text-white">{team.team}</span>
                </div>
                <div className="text-center text-xs text-gray-400">{team.played}</div>
                <div className="text-center text-xs text-white">{team.won}</div>
                <div className="text-center text-xs text-gray-300">{team.drawn}</div>
                <div className="text-center text-xs text-gray-400">{team.lost}</div>
                <div className="text-center text-xs text-gray-400">{team.goalsFor}</div>
                <div className="text-center text-xs text-gray-400">{team.goalsAgainst}</div>
                <div className="text-center text-xs text-gray-400">{team.goalDifference}</div>
                <div className="text-center text-xs font-semibold text-white">{team.points}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
