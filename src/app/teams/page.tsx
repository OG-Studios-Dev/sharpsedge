"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import EmptyStateCard from "@/components/EmptyStateCard";
import TeamLogo from "@/components/TeamLogo";

type NHLStanding = {
  teamAbbrev: string;
  teamName: string;
  points: number;
  wins: number;
  losses: number;
  otLosses: number;
};

type NBAStanding = {
  teamAbbrev: string;
  teamName: string;
  seed: number;
  wins: number;
  losses: number;
  conference: "Eastern" | "Western";
};

type TeamDirectoryRow = {
  id: string;
  league: "NHL" | "NBA";
  teamAbbrev: string;
  teamName: string;
  detail: string;
  href: string;
};

export default function TeamsPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [loading, setLoading] = useState(true);
  const [nhlTeams, setNhlTeams] = useState<NHLStanding[]>([]);
  const [nbaTeams, setNbaTeams] = useState<NBAStanding[]>([]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetch("/api/standings").then((response) => response.json()).catch(() => []),
      fetch("/api/nba/standings").then((response) => response.json()).catch(() => []),
    ]).then(([nhl, nba]) => {
      if (!mounted) return;
      setNhlTeams(Array.isArray(nhl) ? nhl : []);
      setNbaTeams(Array.isArray(nba) ? nba : []);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo<TeamDirectoryRow[]>(() => {
    const nhlRows = nhlTeams.map((team) => ({
      id: `nhl-${team.teamAbbrev}`,
      league: "NHL" as const,
      teamAbbrev: team.teamAbbrev,
      teamName: team.teamName || team.teamAbbrev,
      detail: `${team.wins}-${team.losses}-${team.otLosses} · ${team.points} pts`,
      href: `/team/${team.teamAbbrev}`,
    }));
    const nbaRows = nbaTeams.map((team) => ({
      id: `nba-${team.teamAbbrev}`,
      league: "NBA" as const,
      teamAbbrev: team.teamAbbrev,
      teamName: team.teamName || team.teamAbbrev,
      detail: `${team.wins}-${team.losses} · ${team.conference} #${team.seed}`,
      href: `/nba/team/${team.teamAbbrev}`,
    }));

    if (sportLeague === "NBA") return nbaRows;
    if (sportLeague === "All") return [...nhlRows, ...nbaRows];
    return nhlRows;
  }, [nbaTeams, nhlTeams, sportLeague]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Teams</h1>
            <p className="text-xs text-gray-500 mt-0.5">League directory with direct links into each team page.</p>
          </div>
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <EmptyStateCard
            eyebrow="Teams"
            title="Loading team directories"
            body="Pulling NHL and NBA standings so the current team list stays live."
          />
        ) : rows.length === 0 ? (
          <EmptyStateCard
            eyebrow="Teams"
            title="No teams available right now"
            body="The directory will repopulate automatically when the standings endpoints respond."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={row.href}
                className="rounded-2xl border border-dark-border bg-dark-surface px-4 py-4 transition-colors hover:border-gray-600"
              >
                <div className="flex items-center gap-3">
                  <TeamLogo team={row.teamAbbrev} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold truncate">{row.teamName}</p>
                      <span className="text-[9px] uppercase tracking-[0.18em] text-gray-600">{row.league}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{row.detail}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
