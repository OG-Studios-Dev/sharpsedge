"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import LeagueDropdown from "@/components/LeagueDropdown";
import EmptyStateCard from "@/components/EmptyStateCard";
import TeamLogo from "@/components/TeamLogo";
import PageHeader from "@/components/PageHeader";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import { getStaggerStyle } from "@/lib/stagger-style";

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
    <div className="min-h-screen bg-dark-bg">
      <PageHeader
        title="Teams"
        subtitle="League directory with direct links into each team page."
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      />

      <div className="max-w-2xl mx-auto px-4 py-5">
        {sportLeague === "PGA" ? (
          <EmptyStateCard
            eyebrow="PGA"
            title="Golf does not use team directories"
            body="Use the leaderboard and schedule views for PGA coverage. Golf support in this build is tournament-based, not club-based."
          />
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="stagger-in" style={getStaggerStyle(index)}>
                <CardSkeleton className="h-28" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyStateCard
            eyebrow="Teams"
            title="No teams available right now"
            body="The directory will repopulate automatically when the standings endpoints respond."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row, index) => (
              <Link
                key={row.id}
                href={row.href}
                className="tap-card stagger-in rounded-2xl border border-dark-border bg-dark-surface px-4 py-4 transition-colors hover:border-gray-600"
                style={getStaggerStyle(index)}
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
