"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import LeagueSwitcher from "./LeagueSwitcher";
import ScheduleBoard from "./ScheduleBoard";
import NBAScheduleBoard from "./NBAScheduleBoard";
import MLBScheduleBoard from "./MLBScheduleBoard";
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
    <div className="space-y-6">
      <div className="flex rounded-full bg-dark-surface/60 border border-dark-border/60 p-1 w-full max-w-sm mx-auto">
        {NHL_CONFERENCES.map((c) => (
          <button key={c} onClick={() => setConf(c)}
            className={`flex-1 py-2 text-[13px] font-bold rounded-full transition-all ${conf === c ? "bg-accent-blue text-dark-bg shadow-[0_0_15px_rgba(74,158,255,0.4)]" : "text-text-platinum/50 hover:text-white"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">{[0,1,2].map((i) => <div key={i} className="h-16 rounded-[24px] bg-dark-surface/50 border border-dark-border/40 animate-pulse" />)}</div>
      ) : divisions.map((div) => (
        <div key={div.name}>
          <p className="text-[11px] uppercase tracking-widest font-mono font-bold text-text-platinum/60 mb-3 pl-1">{div.name}</p>
          <div className="rounded-[24px] border border-dark-border/80 bg-gradient-to-b from-dark-surface/50 to-dark-bg overflow-hidden shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)]">
            <div className="grid grid-cols-[1fr_repeat(6,_minmax(28px,40px))_48px] gap-1 px-4 py-3 text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold border-b border-dark-border/50 bg-dark-bg/30">
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
              const streakColor = sc === "W" ? "bg-accent-green/10 text-accent-green border-accent-green/20 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                : sc === "L" ? "bg-accent-red/10 text-accent-red border-accent-red/20"
                : "bg-dark-bg/50 text-text-platinum/50 border-dark-border/60";
              const winPct = team.gamesPlayed > 0 ? ((team.wins / team.gamesPlayed) * 100).toFixed(0) : "0";
              return (
                <Link key={team.teamAbbrev} href={`/team/${team.teamAbbrev}`}
                  className="grid grid-cols-[1fr_repeat(6,_minmax(28px,40px))_48px] gap-1 px-4 py-3 items-center hover:bg-dark-surface/80 transition-colors border-b border-dark-border/40 last:border-b-0 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <TeamLogo team={team.teamAbbrev} logo={team.logo} size={28} />
                    <span className="text-[14px] font-heading font-black text-text-platinum truncate group-hover:text-white transition-colors">{team.teamAbbrev}</span>
                  </div>
                  <div className="text-center text-xs font-mono text-text-platinum/40">{team.gamesPlayed}</div>
                  <div className="text-center text-[13px] font-mono font-bold text-text-platinum">{team.wins}</div>
                  <div className="text-center text-xs font-mono text-text-platinum/40">{team.losses}</div>
                  <div className="text-center text-xs font-mono text-text-platinum/40">{team.otLosses}</div>
                  <div className="text-center text-[14px] font-mono font-black text-accent-blue drop-shadow-[0_0_8px_rgba(74,158,255,0.3)]">{team.points}</div>
                  <div className="text-center text-[10px] font-mono text-text-platinum/60">{winPct}%</div>
                  <div className="flex justify-center">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${streakColor}`}>{team.streakCode || "—"}</span>
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
    <div className="space-y-6">
      <div className="flex rounded-full bg-dark-surface/60 border border-dark-border/60 p-1 w-full max-w-sm mx-auto">
        {(["East","West"] as const).map((c) => (
          <button key={c} onClick={() => setConf(c)}
            className={`flex-1 py-2 text-[13px] font-bold rounded-full transition-all ${conf === c ? "bg-accent-blue text-dark-bg shadow-[0_0_15px_rgba(74,158,255,0.4)]" : "text-text-platinum/50 hover:text-white"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">{[0,1,2].map((i) => <div key={i} className="h-16 rounded-[24px] bg-dark-surface/50 border border-dark-border/40 animate-pulse" />)}</div>
      ) : display.length === 0 ? (
        <div className="text-center py-12 rounded-[24px] border border-dark-border/80 bg-gradient-to-b from-dark-surface/50 to-dark-bg">
          <p className="text-3xl mb-3 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">🏀</p>
          <p className="text-text-platinum font-heading font-bold text-lg">NBA standings unavailable right now</p>
          <p className="text-text-platinum/50 text-sm mt-2 font-sans">Live feed will repopulate automatically when ESPN responds.</p>
        </div>
      ) : (
        <div className="rounded-[24px] border border-dark-border/80 bg-gradient-to-b from-dark-surface/50 to-dark-bg overflow-hidden shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)]">
          <div className="grid grid-cols-[1fr_40px_40px_40px_56px] gap-1 px-4 py-3 text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold border-b border-dark-border/50 bg-dark-bg/30">
            <div>Team</div>
            <div className="text-center">W</div>
            <div className="text-center">L</div>
            <div className="text-center">PCT</div>
            <div className="text-center">Streak</div>
          </div>
          {display.map((team) => {
            const sc = team.streak?.charAt(0);
            const streakColor = sc === "W" ? "bg-accent-green/10 text-accent-green border-accent-green/20 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]"
              : sc === "L" ? "bg-accent-red/10 text-accent-red border-accent-red/20"
              : "bg-dark-bg/50 text-text-platinum/50 border-dark-border/60";
            return (
              <Link key={team.teamAbbrev} href={`/nba/team/${team.teamAbbrev}`}
                className="grid grid-cols-[1fr_40px_40px_40px_56px] gap-1 px-4 py-3 items-center hover:bg-dark-surface/80 transition-colors border-b border-dark-border/40 last:border-b-0 group">
                <div className="flex items-center gap-3 min-w-0">
                  <TeamLogo team={team.teamAbbrev} size={28} />
                  <span className="text-[14px] font-heading font-black text-text-platinum truncate group-hover:text-white transition-colors">{team.teamAbbrev}</span>
                </div>
                <div className="text-center text-[13px] font-mono font-bold text-text-platinum">{team.wins}</div>
                <div className="text-center text-xs font-mono text-text-platinum/40">{team.losses}</div>
                <div className="text-center text-[10px] font-mono text-text-platinum/60">{(team.winPct * 100).toFixed(0)}%</div>
                <div className="flex justify-center">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${streakColor}`}>{team.streak || "—"}</span>
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
                        <TeamLogo team={team.teamAbbrev} size={26} />
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
const VIEW_TABS = ["Schedule", "Standings"] as const;

export default function ScheduleStandingsContent() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [view, setView] = useState<"Schedule" | "Standings">("Schedule");

  return (
    <div className="px-4 lg:px-6 py-6 space-y-8 max-w-3xl mx-auto">
      {/* League Switcher */}
      <LeagueSwitcher active={sportLeague} onChange={setLeague} />

      {/* Schedule / Standings tabs */}
      <div className="flex rounded-[24px] bg-dark-bg/60 border border-dark-border/40 p-1.5 shadow-inner">
        {VIEW_TABS.map((t) => (
          <button key={t} onClick={() => setView(t)}
            className={`flex-1 py-2.5 text-sm font-bold font-sans rounded-[20px] transition-all ${view === t ? "bg-dark-surface/80 text-text-platinum border border-dark-border/60 shadow-[0_4px_15px_-5px_rgba(0,0,0,0.5)]" : "text-text-platinum/40 hover:text-white hover:bg-dark-surface/30"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "Schedule" ? (
        sportLeague === "All" ? (
          <div className="space-y-12">
            <div>
              <div className="flex items-center gap-2 mb-4 pl-1">
                <span className="text-lg">🏒</span>
                <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/60">NHL Schedule</p>
              </div>
              <ScheduleBoard showHeader={false} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4 pl-1 border-t border-dark-border/40 pt-8">
                <span className="text-lg">🏀</span>
                <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/60">NBA Schedule</p>
              </div>
              <NBAScheduleBoard showHeader={false} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚾</span> MLB</p>
              <MLBScheduleBoard />
            </div>
          </div>
        ) : sportLeague === "NBA" ? (
          <NBAScheduleBoard showHeader={false} />
        ) : sportLeague === "MLB" ? (
          <MLBScheduleBoard />
        ) : (
          <ScheduleBoard showHeader={false} />
        )
      ) : (
        // Standings
        sportLeague === "All" ? (
          <div className="space-y-12">
            <div>
              <div className="flex items-center gap-2 mb-4 pl-1">
                <span className="text-lg">🏒</span>
                <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/60">NHL Standings</p>
              </div>
              <NHLStandings />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4 pl-1 border-t border-dark-border/40 pt-8">
                <span className="text-lg">🏀</span>
                <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/60">NBA Standings</p>
              </div>
              <NBAStandings />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5"><span>⚾</span> MLB</p>
              <MLBStandings />
            </div>
          </div>
        ) : sportLeague === "NBA" ? (
          <NBAStandings />
        ) : sportLeague === "MLB" ? (
          <MLBStandings />
        ) : (
          <NHLStandings />
        )
      )}
    </div>
  );
}
