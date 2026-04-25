"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { normalizeSportsLeague } from "@/lib/insights";
import { getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import EmptyStateCard from "@/components/EmptyStateCard";
import LeagueDropdown from "@/components/LeagueDropdown";
import PageHeader from "@/components/PageHeader";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: "player" | "team" | "game";
};

function normalize(text: string) {
  return text.toLowerCase().trim();
}

export default function SearchPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const dashboards = useSportsDashboards(sportLeague);
  const [query, setQuery] = useState("");

  const playerResults = useMemo<SearchResult[]>(() => {
    const q = normalize(query);
    if (!q) return [];

    return dashboards.props
      .filter((prop) => normalize(`${prop.playerName} ${prop.team} ${prop.opponent} ${prop.propType}`).includes(q))
      .slice(0, 12)
      .map((prop) => ({
        id: `player-${prop.id}`,
        title: prop.playerName,
        subtitle: `${prop.team} ${prop.isAway ? "@" : "vs"} ${prop.opponent} · ${prop.overUnder} ${prop.line} ${prop.propType}`,
        href: getPlayerTrendHrefFromProp(prop),
        kind: "player",
      }));
  }, [dashboards.props, query]);

  const teamResults = useMemo<SearchResult[]>(() => {
    const q = normalize(query);
    if (!q) return [];

    const seen = new Set<string>();
    const teams: SearchResult[] = [];

    for (const trend of dashboards.teamTrends) {
      const key = `${trend.league}:${trend.team}`;
      if (seen.has(key)) continue;
      const haystack = normalize(`${trend.team} ${trend.opponent}`);
      if (!haystack.includes(q)) continue;
      seen.add(key);
      teams.push({
        id: `team-${key}`,
        title: trend.team,
        subtitle: `${trend.league} team page`,
        href: trend.league === "NBA"
          ? `/nba/team/${trend.team}`
          : trend.league === "NHL" || trend.league === "MLB"
            ? `/team/${trend.team}`
            : "/schedule",
        kind: "team",
      });
    }

    return teams.slice(0, 12);
  }, [dashboards.teamTrends, query]);

  const gameResults = useMemo<SearchResult[]>(() => {
    const q = normalize(query);
    if (!q) return [];

    const nhlGames = dashboards.nhlSchedule.games
      .filter((game) => normalize(`${game.awayTeam.abbrev} ${game.homeTeam.abbrev} ${game.awayTeam.name ?? ""} ${game.homeTeam.name ?? ""}`).includes(q))
      .map((game) => ({
        id: `nhl-game-${game.id}`,
        title: `${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`,
        subtitle: "NHL matchup",
        href: `/matchup/${game.id}`,
        kind: "game" as const,
      }));

    const nbaGames = dashboards.nbaSchedule
      .filter((game) => normalize(`${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation} ${game.awayTeam.fullName} ${game.homeTeam.fullName}`).includes(q))
      .map((game) => ({
        id: `nba-game-${game.id}`,
        title: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        subtitle: "NBA matchup",
        href: `/nba/matchup/${game.id}`,
        kind: "game" as const,
      }));

    const mlbGames = dashboards.mlbSchedule
      .filter((game) => normalize(`${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation} ${game.awayTeam.fullName} ${game.homeTeam.fullName}`).includes(q))
      .map((game) => ({
        id: `mlb-game-${game.id}`,
        title: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        subtitle: "MLB matchup",
        href: "/schedule",
        kind: "game" as const,
      }));

    const nflGames = dashboards.nflSchedule
      .filter((game) => normalize(`${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation} ${game.awayTeam.fullName} ${game.homeTeam.fullName}`).includes(q))
      .map((game) => ({
        id: `nfl-game-${game.id}`,
        title: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        subtitle: "NFL matchup",
        href: "/schedule",
        kind: "game" as const,
      }));

    const eplGames = dashboards.eplSchedule
      .filter((game) => normalize(`${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation} ${game.awayTeam.name} ${game.homeTeam.name}`).includes(q))
      .map((game) => ({
        id: `epl-game-${game.id}`,
        title: `${game.awayTeam.shortName} @ ${game.homeTeam.shortName}`,
        subtitle: "EPL fixture",
        href: "/schedule",
        kind: "game" as const,
      }));

    const serieAGames = dashboards.serieASchedule
      .filter((game) => normalize(`${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation} ${game.awayTeam.name} ${game.homeTeam.name}`).includes(q))
      .map((game) => ({
        id: `serie-a-game-${game.id}`,
        title: `${game.awayTeam.shortName} @ ${game.homeTeam.shortName}`,
        subtitle: "Serie A fixture",
        href: "/schedule",
        kind: "game" as const,
      }));

    return [...nhlGames, ...nbaGames, ...mlbGames, ...nflGames, ...eplGames, ...serieAGames].slice(0, 12);
  }, [dashboards.eplSchedule, dashboards.mlbSchedule, dashboards.nbaSchedule, dashboards.nflSchedule, dashboards.nhlSchedule.games, dashboards.serieASchedule, query]);

  const results = [...playerResults, ...teamResults, ...gameResults];
  const hasQuery = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-dark-bg">
      <PageHeader
        title="Search"
        subtitle="Players, teams, and matchups from the active slate."
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      >
        <div className="max-w-2xl mx-auto">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players, teams, or matchups"
            className="w-full rounded-2xl border border-dark-border bg-dark-surface px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-accent-blue/50"
          />
        </div>
      </PageHeader>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {dashboards.error ? (
          <EmptyStateCard
            eyebrow="Search unavailable"
            title="Live slate search did not load"
            body={dashboards.error}
          />
        ) : dashboards.loading ? (
          <EmptyStateCard
            eyebrow="Search"
            title="Indexing the current slate"
            body="Goosalytics is loading players, team trends, and scheduled matchups for the active leagues."
          />
        ) : !hasQuery ? (
          <EmptyStateCard
            eyebrow="Search"
            title="Start typing to search the live slate"
            body="Search matches against player props, team trends, and game cards from the current NHL, NBA, and MLB dashboards."
          />
        ) : results.length === 0 ? (
          <EmptyStateCard
            eyebrow="No results"
            title={`No matches found for “${query.trim()}”`}
            body="Try a player surname, team abbreviation, or matchup like BOS or Lakers."
          />
        ) : (
          <div className="space-y-3">
            {results.map((result) => (
              <Link
                key={result.id}
                href={result.href}
                className="block rounded-2xl border border-dark-border bg-dark-surface px-4 py-4 transition-colors hover:border-gray-600"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-semibold">{result.title}</p>
                    <p className="text-sm text-gray-400 mt-1">{result.subtitle}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-gray-600">{result.kind}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
