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

type MLBStanding = {
  teamAbbrev: string;
  teamName: string;
  league: "AL" | "NL";
  division: string;
  wins: number;
  losses: number;
};

type TeamDirectoryRow = {
  id: string;
  league: "NHL" | "NBA" | "MLB";
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
  const [mlbTeams, setMlbTeams] = useState<MLBStanding[]>([]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetch("/api/standings").then((response) => response.json()).catch(() => []),
      fetch("/api/nba/standings").then((response) => response.json()).catch(() => []),
      fetch("/api/mlb/standings").then((response) => response.json()).catch(() => []),
    ]).then(([nhl, nba, mlb]) => {
      if (!mounted) return;
      setNhlTeams(Array.isArray(nhl) ? nhl : []);
      setNbaTeams(Array.isArray(nba) ? nba : []);
      setMlbTeams(Array.isArray(mlb) ? mlb : []);
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
    const mlbRows = mlbTeams.map((team) => ({
      id: `mlb-${team.teamAbbrev}`,
      league: "MLB" as const,
      teamAbbrev: team.teamAbbrev,
      teamName: team.teamName || team.teamAbbrev,
      detail: `${team.wins}-${team.losses} · ${team.league} ${team.division}`,
      href: "/props",
    }));

    if (sportLeague === "NBA") return nbaRows;
    if (sportLeague === "MLB") return mlbRows;
    if (sportLeague === "All") return [...nhlRows, ...nbaRows, ...mlbRows];
    return nhlRows;
  }, [mlbTeams, nbaTeams, nhlTeams, sportLeague]);

  return (
    <main className="min-h-screen bg-dark-bg pb-32">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border/60">
        <div className="flex items-center justify-between px-4 lg:px-6 py-5 max-w-3xl mx-auto">
          <div>
            <h1 className="text-2xl font-black text-text-platinum font-heading tracking-tight">Teams</h1>
            <p className="text-xs text-text-platinum/50 mt-1 font-mono">League directory with fast portal access.</p>
          </div>
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 lg:px-6 mt-6 space-y-4">
        {loading ? (
          <EmptyStateCard
            eyebrow="Teams"
            title="Loading team directories"
            body="Pulling NHL, NBA, and MLB standings so the current team list stays live."
            className="mx-0"
          />
        ) : rows.length === 0 ? (
          <EmptyStateCard
            eyebrow="Teams"
            title="No teams available right now"
            body="The directory will repopulate automatically when the standings endpoints respond."
            className="mx-0"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={row.href}
                className="group rounded-[24px] border border-dark-border/80 bg-gradient-to-br from-dark-surface/60 to-dark-bg p-5 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] transition-all hover:-translate-y-[2px] hover:border-accent-blue/40"
              >
                <div className="flex items-center gap-4">
                  <TeamLogo team={row.teamAbbrev} size={44} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[15px] font-heading font-black text-text-platinum truncate group-hover:text-white transition-colors">{row.teamName}</p>
                      <span className="rounded bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent-blue font-mono">{row.league}</span>
                    </div>
                    <p className="text-xs font-mono text-text-platinum/50 font-bold tracking-tight">{row.detail}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
