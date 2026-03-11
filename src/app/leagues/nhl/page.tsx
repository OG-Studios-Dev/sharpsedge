"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import type { TeamStandingRow } from "@/lib/nhl-api";

const CONFERENCES = ["Eastern", "Western"] as const;
const DIVISIONS: Record<string, string[]> = {
  Eastern: ["Atlantic", "Metropolitan"],
  Western: ["Central", "Pacific"],
};

export default function NHLStandingsPage() {
  const [standings, setStandings] = useState<TeamStandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof CONFERENCES)[number]>("Eastern");

  useEffect(() => {
    fetch("/api/standings")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStandings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const divisions = useMemo(() => {
    const divs = DIVISIONS[tab];
    return divs.map((div) => ({
      name: div,
      teams: standings
        .filter((t) => t.conferenceName === tab && t.divisionName === div)
        .sort((a, b) => b.points - a.points),
    }));
  }, [standings, tab]);

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/leagues" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-white">NHL Standings</h1>
        </div>
      </header>

      <div className="px-4 pt-4">
        <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1 mb-4">
          {CONFERENCES.map((c) => (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                tab === c ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 space-y-6">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Loading standings...</p>
        ) : (
          divisions.map((div) => (
            <div key={div.name}>
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">{div.name}</div>

              <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
                <div className="grid grid-cols-[1fr_repeat(5,_minmax(28px,40px))_48px] gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-dark-border/50">
                  <div>Team</div>
                  <div className="text-center">GP</div>
                  <div className="text-center">W</div>
                  <div className="text-center">L</div>
                  <div className="text-center">OTL</div>
                  <div className="text-center">PTS</div>
                  <div className="text-center">Streak</div>
                </div>

                {div.teams.map((team) => {
                  const streakType = team.streakCode.charAt(0);
                  const streakColor =
                    streakType === "W" ? "bg-accent-green/20 text-accent-green border-accent-green/30" :
                    streakType === "L" ? "bg-accent-red/20 text-accent-red border-accent-red/30" :
                    "bg-dark-bg text-gray-400 border-dark-border";

                  return (
                    <Link
                      key={team.teamAbbrev}
                      href={`/team/${team.teamAbbrev}`}
                      className="grid grid-cols-[1fr_repeat(5,_minmax(28px,40px))_48px] gap-1 px-3 py-2.5 items-center hover:bg-dark-bg/50 transition-colors border-b border-dark-border/30 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamLogo team={team.teamAbbrev} logo={team.logo} size={28} />
                        <span className="text-sm text-white font-medium truncate">{team.teamName}</span>
                      </div>
                      <div className="text-center text-xs text-gray-400">{team.gamesPlayed}</div>
                      <div className="text-center text-xs text-white font-medium">{team.wins}</div>
                      <div className="text-center text-xs text-gray-400">{team.losses}</div>
                      <div className="text-center text-xs text-gray-400">{team.otLosses}</div>
                      <div className="text-center text-xs text-white font-bold">{team.points}</div>
                      <div className="flex justify-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${streakColor}`}>
                          {team.streakCode || "-"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
