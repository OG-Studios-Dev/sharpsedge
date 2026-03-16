"use client";

import { useEffect, useState } from "react";
import type { NFLTeamStanding } from "@/lib/nfl-api";
import TeamLogo from "@/components/TeamLogo";

export default function NFLStandingsTable() {
  const [standings, setStandings] = useState<NFLTeamStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nfl/standings")
      .then((response) => response.json())
      .then((data) => {
        setStandings(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const conferences = ["AFC", "NFC"].map((conference) => ({
    conference,
    teams: standings
      .filter((team) => team.conference === conference)
      .sort((left, right) => left.position - right.position || right.wins - left.wins),
  }));

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      <div className="mb-3">
        <h3 className="page-heading">NFL Standings</h3>
        <p className="mt-0.5 text-[11px] text-gray-500">Last available AFC and NFC tables</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-dark-border/40" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {conferences.map(({ conference, teams }) => (
            <div key={conference}>
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">{conference}</p>
              {teams.length === 0 ? (
                <div className="rounded-xl border border-dark-border/60 bg-dark-bg/60 px-4 py-4 text-sm text-gray-400">
                  No {conference} standings available
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[520px] overflow-hidden rounded-2xl border border-dark-border/60">
                    <div className="grid grid-cols-[32px_1fr_44px_44px_44px_72px] gap-1 border-b border-dark-border/50 bg-dark-bg/60 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500">
                      <div className="text-center">#</div>
                      <div>Team</div>
                      <div className="text-center">W</div>
                      <div className="text-center">L</div>
                      <div className="text-center">T</div>
                      <div className="text-center">Div</div>
                    </div>
                    {teams.map((team) => (
                      <div
                        key={`${conference}-${team.team}`}
                        className="grid grid-cols-[32px_1fr_44px_44px_44px_72px] gap-1 items-center border-b border-dark-border/30 px-3 py-2.5 last:border-b-0"
                      >
                        <div className="text-center text-xs text-gray-400">{team.position}</div>
                        <div className="flex items-center gap-2 min-w-0">
                          <TeamLogo team={team.team} logo={team.logo} size={24} color={team.color} />
                          <span className="truncate text-xs font-medium text-white">{team.team}</span>
                        </div>
                        <div className="text-center text-xs font-medium text-white">{team.wins}</div>
                        <div className="text-center text-xs text-gray-400">{team.losses}</div>
                        <div className="text-center text-xs text-gray-400">{team.ties}</div>
                        <div className="text-center text-xs text-gray-400">{team.division}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
