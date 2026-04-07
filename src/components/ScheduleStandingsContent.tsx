"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { normalizeSportsLeague } from "@/lib/insights";
import EmptyStateCard from "./EmptyStateCard";
import GolfLeaderboardCard from "./GolfLeaderboardCard";
import GolfMarketEdgesSection from "./GolfMarketEdgesSection";
import GolfPlayerCard from "./GolfPlayerCard";
import GolfScheduleBoard from "./GolfScheduleBoard";
import LeagueSwitcher from "./LeagueSwitcher";
import ScheduleBoard from "./ScheduleBoard";
import NBAScheduleBoard from "./NBAScheduleBoard";
import MLBScheduleBoard from "./MLBScheduleBoard";
import NFLScheduleBoard from "./NFLScheduleBoard";
import NFLStandingsTable from "./NFLStandingsTable";
import SoccerScheduleBoard from "./SoccerScheduleBoard";
import SoccerStandingsTable from "./SoccerStandingsTable";
import TeamLogo from "./TeamLogo";
import type { TeamStandingRow } from "@/lib/nhl-api";

// ─── NHL Standings ────────────────────────────────────────────────────────────
const NHL_CONFERENCES = ["Eastern", "Western"] as const;
const NHL_DIVISIONS: Record<string, string[]> = {
  Eastern: ["Atlantic", "Metropolitan"],
  Western: ["Central", "Pacific"],
};

function NHLStandings() {
  const [standings, setStandings] = useState<TeamStandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [conf, setConf] = useState<"Eastern" | "Western">("Eastern");

  useEffect(() => {
    fetch("/api/standings")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStandings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const divisions = useMemo(() => {
    return NHL_DIVISIONS[conf].map((div) => ({
      name: div,
      teams: standings
        .filter((t) => t.conferenceName === conf && t.divisionName === div)
        .sort((a, b) => b.points - a.points),
    }));
  }, [standings, conf]);

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1">
        {NHL_CONFERENCES.map((c) => (
          <button key={c} onClick={() => setConf(c)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${conf === c ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0,1,2].map((i) => <div key={i} className="h-16 rounded-xl bg-dark-border/40 animate-pulse" />)}</div>
      ) : divisions.map((div) => (
        <div key={div.name}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-2">{div.name}</p>
          <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
            <div className="grid grid-cols-[1fr_repeat(6,_minmax(28px,40px))_48px] gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-dark-border/50">
              <div>Team</div>
              <div className="text-center">GP</div>
              <div className="text-center">W</div>
              <div className="text-center">L</div>
              <div className="text-center">OTL</div>
              <div className="text-center">PTS</div>
              <div className="text-center">W%</div>
              <div className="text-center">Streak</div>
            </div>
            {div.teams.map((team) => {
              const sc = team.streakCode?.charAt(0);
              const streakColor = sc === "W" ? "bg-accent-green/20 text-accent-green border-accent-green/30"
                : sc === "L" ? "bg-accent-red/20 text-accent-red border-accent-red/30"
                : "bg-dark-bg text-gray-400 border-dark-border";
              const winPct = team.gamesPlayed > 0 ? ((team.wins / team.gamesPlayed) * 100).toFixed(0) : "0";
              return (
                <Link key={team.teamAbbrev} href={`/team/${team.teamAbbrev}`}
                  className="grid grid-cols-[1fr_repeat(6,_minmax(28px,40px))_48px] gap-1 px-3 py-2.5 items-center hover:bg-dark-bg/50 transition-colors border-b border-dark-border/30 last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo team={team.teamAbbrev} logo={team.logo} size={26} sport="NHL" />
                    <span className="text-xs text-white font-medium truncate">{team.teamAbbrev}</span>
                  </div>
                  <div className="text-center text-xs text-gray-400">{team.gamesPlayed}</div>
                  <div className="text-center text-xs text-white font-medium">{team.wins}</div>
                  <div className="text-center text-xs text-gray-400">{team.losses}</div>
                  <div className="text-center text-xs text-gray-400">{team.otLosses}</div>
                  <div className="text-center text-xs text-white font-bold">{team.points}</div>
                  <div className="text-center text-xs text-gray-400">{winPct}%</div>
                  <div className="flex justify-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${streakColor}`}>{team.streakCode || "—"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── NBA Standings ────────────────────────────────────────────────────────────
type NBAStanding = {
  teamAbbrev: string;
  teamName: string;
  conference: "Eastern" | "Western";
  seed: number;
  wins: number;
  losses: number;
  winPct: number;
  homeRecord: string;
  roadRecord: string;
  streak: string;
};

type MLBStanding = {
  teamAbbrev: string;
  teamName: string;
  league: "AL" | "NL";
  division: string;
  wins: number;
  losses: number;
  winPct: number;
  gamesBack: string;
  streak: string;
};

function NBAStandings() {
  const [standings, setStandings] = useState<NBAStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [conf, setConf] = useState<"East" | "West">("East");

  useEffect(() => {
    fetch("/api/nba/standings")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStandings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const display = standings
    .filter((team) => team.conference === (conf === "East" ? "Eastern" : "Western"))
    .sort((a, b) => a.seed - b.seed || a.losses - b.losses || b.wins - a.wins);

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1">
        {(["East","West"] as const).map((c) => (
          <button key={c} onClick={() => setConf(c)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${conf === c ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0,1,2].map((i) => <div key={i} className="h-12 rounded-xl bg-dark-border/40 animate-pulse" />)}</div>
      ) : display.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-2xl mb-2">🏀</p>
          <p className="text-gray-400 text-sm">NBA standings unavailable right now</p>
          <p className="text-gray-600 text-xs mt-1">Live feed will repopulate automatically when ESPN responds.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_40px_40px_40px_56px] gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-dark-border/50">
            <div>Team</div>
            <div className="text-center">W</div>
            <div className="text-center">L</div>
            <div className="text-center">PCT</div>
            <div className="text-center">Streak</div>
          </div>
          {display.map((team) => {
            const sc = team.streak?.charAt(0);
            const streakColor = sc === "W" ? "bg-accent-green/20 text-accent-green border-accent-green/30"
              : sc === "L" ? "bg-accent-red/20 text-accent-red border-accent-red/30"
              : "bg-dark-bg text-gray-400 border-dark-border";
            return (
              <Link key={team.teamAbbrev} href={`/nba/team/${team.teamAbbrev}`}
                className="grid grid-cols-[1fr_40px_40px_40px_56px] gap-1 px-3 py-2.5 items-center hover:bg-dark-bg/50 transition-colors border-b border-dark-border/30 last:border-b-0">
                <div className="flex items-center gap-2 min-w-0">
                  <TeamLogo team={team.teamAbbrev} size={26} sport="NBA" />
                  <span className="text-xs text-white font-medium truncate">{team.teamAbbrev}</span>
                </div>
                <div className="text-center text-xs text-white font-medium">{team.wins}</div>
                <div className="text-center text-xs text-gray-400">{team.losses}</div>
                <div className="text-center text-xs text-gray-400">{(team.winPct * 100).toFixed(0)}%</div>
                <div className="flex justify-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${streakColor}`}>{team.streak || "—"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MLBStandings() {
  const [standings, setStandings] = useState<MLBStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [league, setLeague] = useState<"AL" | "NL">("AL");

  useEffect(() => {
    fetch("/api/mlb/standings")
      .then((response) => response.json())
      .then((data) => { if (Array.isArray(data)) setStandings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const divisions = useMemo(() => {
    const filtered = standings.filter((team) => team.league === league);
    const grouped = new Map<string, MLBStanding[]>();
    for (const team of filtered) {
      if (!grouped.has(team.division)) grouped.set(team.division, []);
      grouped.get(team.division)!.push(team);
    }
    return Array.from(grouped.entries()).map(([division, teams]) => ({
      division,
      teams: teams.sort((a, b) => b.wins - a.wins || a.losses - b.losses),
    }));
  }, [league, standings]);

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1">
        {(["AL", "NL"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setLeague(value)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${league === value ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"}`}
          >
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((index) => <div key={index} className="h-14 rounded-xl bg-dark-border/40 animate-pulse" />)}</div>
      ) : divisions.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-2xl mb-2">⚾</p>
          <p className="text-sm text-gray-400">MLB standings unavailable right now</p>
          <p className="mt-1 text-xs text-gray-600">Standings repopulate automatically once the Stats API responds.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {divisions.map((division) => (
            <div key={division.division}>
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">{division.division}</p>
              <div className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface">
                <div className="grid grid-cols-[1fr_40px_40px_48px_48px_56px] gap-1 border-b border-dark-border/50 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500">
                  <div>Team</div>
                  <div className="text-center">W</div>
                  <div className="text-center">L</div>
                  <div className="text-center">PCT</div>
                  <div className="text-center">GB</div>
                  <div className="text-center">Streak</div>
                </div>
                {division.teams.map((team) => {
                  const streakColor = team.streak.startsWith("W")
                    ? "bg-accent-green/20 text-accent-green border-accent-green/30"
                    : team.streak.startsWith("L")
                      ? "bg-accent-red/20 text-accent-red border-accent-red/30"
                      : "bg-dark-bg text-gray-400 border-dark-border";

                  return (
                    <div
                      key={team.teamAbbrev}
                      className="grid grid-cols-[1fr_40px_40px_48px_48px_56px] gap-1 items-center border-b border-dark-border/30 px-3 py-2.5 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamLogo team={team.teamAbbrev} size={26} sport="MLB" />
                        <span className="truncate text-xs font-medium text-white">{team.teamAbbrev}</span>
                      </div>
                      <div className="text-center text-xs font-medium text-white">{team.wins}</div>
                      <div className="text-center text-xs text-gray-400">{team.losses}</div>
                      <div className="text-center text-xs text-gray-400">{(team.winPct * 100).toFixed(0)}%</div>
                      <div className="text-center text-xs text-gray-400">{team.gamesBack}</div>
                      <div className="flex justify-center">
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${streakColor}`}>{team.streak || "—"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type MainView = "Schedule" | "Standings" | "Leaderboard";

export default function ScheduleStandingsContent() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const dashboards = useSportsDashboards(sportLeague);
  const [view, setView] = useState<MainView>("Schedule");

  useEffect(() => {
    setView(sportLeague === "PGA" ? "Leaderboard" : "Schedule");
  }, [sportLeague]);

  const viewTabs = sportLeague === "PGA"
    ? (["Leaderboard", "Schedule"] as const)
    : (["Schedule", "Standings"] as const);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 space-y-4 lg:px-0 overflow-x-hidden">
      {/* League Switcher */}
      <LeagueSwitcher active={sportLeague} onChange={setLeague} />

      {/* Schedule / Standings tabs */}
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1">
        {viewTabs.map((t) => (
          <button key={t} onClick={() => setView(t)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${view === t ? "bg-dark-bg text-white border border-dark-border" : "text-gray-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {sportLeague === "PGA" ? (
        view === "Leaderboard" ? (
          <div className="space-y-5">
            <GolfLeaderboardCard leaderboard={dashboards.golfDashboard?.leaderboard ?? null} loading={dashboards.loading} />
            {dashboards.loading ? (
              <div className="h-48 animate-pulse rounded-2xl bg-dark-border/40" />
            ) : (
              <GolfMarketEdgesSection
                predictions={dashboards.golfDashboard?.predictions ?? null}
                href={dashboards.golfDashboard?.predictions?.tournament?.id ? `/golf/tournament/${dashboards.golfDashboard.predictions.tournament.id}` : "/golf"}
                compact
              />
            )}
          </div>
        ) : (
          <GolfScheduleBoard tournaments={dashboards.golfDashboard?.schedule ?? []} loading={dashboards.loading} />
        )
      ) : view === "Schedule" ? (
        sportLeague === "All" ? (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏒</span> NHL</p>
              <ScheduleBoard />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏀</span> NBA</p>
              <NBAScheduleBoard />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚾</span> MLB</p>
              <MLBScheduleBoard />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏈</span> NFL</p>
              <NFLScheduleBoard />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚽</span> EPL</p>
              <SoccerScheduleBoard league="EPL" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚽</span> Serie A</p>
              <SoccerScheduleBoard league="SERIE_A" />
            </div>
          </div>
        ) : sportLeague === "NBA" ? (
          <NBAScheduleBoard />
        ) : sportLeague === "MLB" ? (
          <MLBScheduleBoard />
        ) : sportLeague === "NFL" ? (
          <NFLScheduleBoard showHeader />
        ) : sportLeague === "EPL" ? (
          <SoccerScheduleBoard league="EPL" showHeader />
        ) : sportLeague === "Serie A" ? (
          <SoccerScheduleBoard league="SERIE_A" showHeader />
        ) : (
          <ScheduleBoard />
        )
      ) : (
        // Standings
        sportLeague === "All" ? (
          <div className="space-y-8">
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏒</span> NHL</p>
              <NHLStandings />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏀</span> NBA</p>
              <NBAStandings />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚾</span> MLB</p>
              <MLBStandings />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏈</span> NFL</p>
              <NFLStandingsTable />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚽</span> EPL</p>
              <SoccerStandingsTable league="EPL" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚽</span> Serie A</p>
              <SoccerStandingsTable league="SERIE_A" />
            </div>
          </div>
        ) : sportLeague === "NBA" ? (
          <NBAStandings />
        ) : sportLeague === "MLB" ? (
          <MLBStandings />
        ) : sportLeague === "NFL" ? (
          <NFLStandingsTable />
        ) : sportLeague === "EPL" ? (
          <SoccerStandingsTable league="EPL" />
        ) : sportLeague === "Serie A" ? (
          <SoccerStandingsTable league="SERIE_A" />
        ) : (
          <NHLStandings />
        )
      )}
    </div>
  );
}
