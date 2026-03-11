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
                    <TeamLogo team={team.teamAbbrev} logo={team.logo} size={26} />
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
  teamAbbrev: string; teamName: string;
  wins: number; losses: number; winPct: number;
  homeWins: number; homeLosses: number;
  awayWins: number; awayLosses: number;
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

  // BallDontLie doesn't give conference — split by win% top 15 each as fallback
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct);
  const east = sorted.slice(0, Math.ceil(sorted.length / 2));
  const west = sorted.slice(Math.ceil(sorted.length / 2));
  const display = conf === "East" ? east : west;

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
          <p className="text-gray-400 text-sm">NBA standings loading</p>
          <p className="text-gray-600 text-xs mt-1">Requires BallDontLie API key</p>
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
                  <TeamLogo team={team.teamAbbrev} size={26} />
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

// ─── Main Component ───────────────────────────────────────────────────────────
const VIEW_TABS = ["Schedule", "Standings"] as const;

export default function ScheduleStandingsContent() {
  const [league, setLeague] = useLeague();
  const [view, setView] = useState<"Schedule" | "Standings">("Schedule");

  return (
    <div className="px-4 py-5 space-y-4">
      {/* League Switcher */}
      <LeagueSwitcher active={league} onChange={setLeague} />

      {/* Schedule / Standings tabs */}
      <div className="flex rounded-xl bg-dark-surface border border-dark-border p-1">
        {VIEW_TABS.map((t) => (
          <button key={t} onClick={() => setView(t)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${view === t ? "bg-dark-bg text-white border border-dark-border" : "text-gray-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "Schedule" ? (
        league === "All" ? (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏒</span> NHL</p>
              <ScheduleBoard />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏀</span> NBA</p>
              <NBAScheduleBoard />
            </div>
          </div>
        ) : league === "NBA" ? (
          <NBAScheduleBoard />
        ) : (
          <ScheduleBoard />
        )
      ) : (
        // Standings
        league === "All" ? (
          <div className="space-y-8">
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏒</span> NHL</p>
              <NHLStandings />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>🏀</span> NBA</p>
              <NBAStandings />
            </div>
          </div>
        ) : league === "NBA" ? (
          <NBAStandings />
        ) : (
          <NHLStandings />
        )
      )}
    </div>
  );
}
