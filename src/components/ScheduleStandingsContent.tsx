"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLeague } from "@/hooks/useLeague";
import LeagueSwitcher from "./LeagueSwitcher";
import ScheduleBoard from "./ScheduleBoard";
import NBAScheduleBoard from "./NBAScheduleBoard";
import TeamLogo from "./TeamLogo";
import type { TeamStandingRow } from "@/lib/nhl-api";

// ─── NHL Standings ────────────────────────────────────────────────────────────

const CONFERENCES = ["Eastern", "Western"] as const;
const DIVISIONS: Record<string, string[]> = {
  Eastern: ["Atlantic", "Metropolitan"],
  Western: ["Central", "Pacific"],
};

function NHLStandings() {
  const [standings, setStandings] = useState<TeamStandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [conf, setConf] = useState<(typeof CONFERENCES)[number]>("Eastern");

  useEffect(() => {
    fetch("/api/standings")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStandings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const divisions = useMemo(() => {
    return DIVISIONS[conf].map((div) => ({
      name: div,
      teams: standings
        .filter((t) => t.conferenceName === conf && t.divisionName === div)
        .sort((a, b) => b.points - a.points),
    }));
  }, [standings, conf]);

  return (
    <div>
      {/* Conference tabs */}
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1 mb-4">
        {CONFERENCES.map((c) => (
          <button
            key={c}
            onClick={() => setConf(c)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              conf === c ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-dark-border/40 animate-pulse" />)}</div>
      ) : (
        <div className="space-y-5">
          {divisions.map((div) => (
            <div key={div.name}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-2">{div.name}</p>
              <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
                <div className="grid grid-cols-[1fr_repeat(5,minmax(26px,36px))_44px] gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-dark-border/50">
                  <div>Team</div>
                  <div className="text-center">GP</div>
                  <div className="text-center">W</div>
                  <div className="text-center">L</div>
                  <div className="text-center">OTL</div>
                  <div className="text-center">PTS</div>
                  <div className="text-center">Str</div>
                </div>
                {div.teams.map((team) => {
                  const st = team.streakCode?.charAt(0);
                  const sc = st === "W" ? "bg-accent-green/15 text-accent-green border-accent-green/30"
                    : st === "L" ? "bg-accent-red/15 text-accent-red border-accent-red/30"
                    : "bg-dark-bg text-gray-400 border-dark-border";
                  return (
                    <Link
                      key={team.teamAbbrev}
                      href={`/team/${team.teamAbbrev}`}
                      className="grid grid-cols-[1fr_repeat(5,minmax(26px,36px))_44px] gap-1 px-3 py-2.5 items-center hover:bg-dark-bg/50 transition-colors border-b border-dark-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamLogo team={team.teamAbbrev} logo={team.logo} size={24} />
                        <span className="text-xs text-white font-medium truncate">{team.teamAbbrev}</span>
                      </div>
                      <div className="text-center text-xs text-gray-400">{team.gamesPlayed}</div>
                      <div className="text-center text-xs text-white">{team.wins}</div>
                      <div className="text-center text-xs text-gray-400">{team.losses}</div>
                      <div className="text-center text-xs text-gray-400">{team.otLosses}</div>
                      <div className="text-center text-xs text-white font-bold">{team.points}</div>
                      <div className="flex justify-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${sc}`}>
                          {team.streakCode || "-"}
                        </span>
                      </div>
                    </Link>
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

// ─── NBA Standings ────────────────────────────────────────────────────────────

type NBAStanding = {
  teamAbbrev: string;
  teamName: string;
  wins: number;
  losses: number;
  winPct: number;
  streak: string;
};

function NBAStandings() {
  const [standings, setStandings] = useState<NBAStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nba/dashboard")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.standings) && data.standings.length > 0) {
          setStandings(data.standings);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-32 rounded-xl bg-dark-border/40 animate-pulse" />;

  if (standings.length === 0) {
    return (
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-6 text-center">
        <p className="text-2xl mb-2">🏀</p>
        <p className="text-gray-400 text-sm">NBA standings coming soon</p>
        <p className="text-gray-600 text-xs mt-1">Requires MySportsFeeds or official standings API</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
      <div className="grid grid-cols-[1fr_repeat(3,minmax(36px,52px))] gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-dark-border/50">
        <div>Team</div>
        <div className="text-center">W</div>
        <div className="text-center">L</div>
        <div className="text-center">Str</div>
      </div>
      {standings.map((team) => {
        const st = team.streak?.charAt(0);
        const sc = st === "W" ? "bg-accent-green/15 text-accent-green border-accent-green/30"
          : st === "L" ? "bg-accent-red/15 text-accent-red border-accent-red/30"
          : "bg-dark-bg text-gray-400 border-dark-border";
        return (
          <div key={team.teamAbbrev} className="grid grid-cols-[1fr_repeat(3,minmax(36px,52px))] gap-1 px-3 py-2.5 items-center border-b border-dark-border/30 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo team={team.teamAbbrev} size={24} />
              <span className="text-xs text-white font-medium truncate">{team.teamAbbrev}</span>
            </div>
            <div className="text-center text-xs text-white">{team.wins}</div>
            <div className="text-center text-xs text-gray-400">{team.losses}</div>
            <div className="flex justify-center">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${sc}`}>
                {team.streak || "-"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

const VIEW_TABS = ["Schedule", "Standings"] as const;
type ViewTab = typeof VIEW_TABS[number];

export default function ScheduleStandingsContent() {
  const [league, setLeague] = useLeague();
  const [view, setView] = useState<ViewTab>("Schedule");

  const showNHL = league === "All" || league === "NHL";
  const showNBA = league === "All" || league === "NBA";

  return (
    <div className="px-4 py-5 space-y-4">
      {/* League switcher */}
      <LeagueSwitcher active={league} onChange={setLeague} />

      {/* Schedule / Standings tab toggle */}
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1">
        {VIEW_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              view === t ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "Schedule" && (
        <div className="space-y-4">
          {showNHL && (
            <div>
              {league === "All" && <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">🏒 NHL</p>}
              <ScheduleBoard />
            </div>
          )}
          {showNBA && (
            <div>
              {league === "All" && <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">🏀 NBA</p>}
              <NBAScheduleBoard />
            </div>
          )}
        </div>
      )}

      {view === "Standings" && (
        <div className="space-y-6">
          {showNHL && (
            <div>
              {league === "All" && <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">🏒 NHL Standings</p>}
              <NHLStandings />
            </div>
          )}
          {showNBA && (
            <div>
              {league === "All" && <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">🏀 NBA Standings</p>}
              <NBAStandings />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
