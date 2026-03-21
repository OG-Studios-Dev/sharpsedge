"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { NHL_TEAM_COLORS } from "@/lib/nhl-api";
import { MLB_TEAM_COLORS } from "@/lib/mlb-api";
import type { TeamStandingRow, TeamRecentGame } from "@/lib/nhl-api";

type RosterPlayer = {
  id: number;
  firstName: { default: string };
  lastName: { default: string };
  positionCode: string;
  sweaterNumber?: number;
};

type TeamData = {
  league?: string;
  standing: TeamStandingRow | null;
  recentGames: TeamRecentGame[];
  roster: RosterPlayer[];
};

const POS_LABELS: Record<string, string> = { C: "Center", L: "LW", R: "RW", D: "Defense", G: "Goalie" };
const POS_COLORS: Record<string, string> = {
  C: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  L: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  R: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  D: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  G: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

export default function TeamPage() {
  const params = useParams<{ abbrev: string }>();
  const abbrev = (params.abbrev || "").toUpperCase();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!abbrev) return;
    fetch(`/api/team/${abbrev}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [abbrev]);

  const st = data?.standing;
  const teamLeague = data?.league || "NHL";
  const isMLB = teamLeague === "MLB";
  const color = isMLB ? (MLB_TEAM_COLORS[abbrev] || "#4a9eff") : (NHL_TEAM_COLORS[abbrev] || "#4a9eff");
  const goalsPerGame = st && st.gamesPlayed > 0 ? (st.goalsFor / st.gamesPlayed).toFixed(1) : "-";
  const goalsAgainstPerGame = st && st.gamesPlayed > 0 ? (st.goalsAgainst / st.gamesPlayed).toFixed(1) : "-";

  const streakType = st?.streakCode?.charAt(0);
  const streakColor =
    streakType === "W" ? "bg-accent-green/20 text-accent-green border-accent-green/30" :
    streakType === "L" ? "bg-accent-red/20 text-accent-red border-accent-red/30" :
    "bg-dark-bg text-gray-400 border-dark-border";

  const rosterPlayers = isMLB
    ? (data?.roster || []).slice(0, 15)
    : (data?.roster || []).filter((p) => p.positionCode !== "G").slice(0, 10);

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={isMLB ? "/schedule" : "/leagues/nhl"} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-white">{st?.teamName || abbrev}</h1>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-12">Loading team data...</p>
      ) : !st ? (
        <p className="text-sm text-gray-500 text-center py-12">Team not found.</p>
      ) : (
        <div className="px-4 py-6 space-y-5">
          {/* Hero */}
          <div className="flex items-center gap-4">
            <TeamLogo team={abbrev} logo={st.logo} size={64} color={color} />
            <div>
              <div className="text-white text-2xl font-bold">{st.teamName}</div>
              <div className="text-sm text-gray-400">{st.conferenceName} &middot; {st.divisionName}</div>
            </div>
          </div>

          {/* Record */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Record</div>
            <div className={`grid ${isMLB ? "grid-cols-4" : "grid-cols-5"} gap-2 text-center`}>
              {(isMLB ? [
                { label: "GP", val: st.gamesPlayed },
                { label: "W", val: st.wins },
                { label: "L", val: st.losses },
                { label: "PCT", val: st.gamesPlayed > 0 ? (st.wins / st.gamesPlayed).toFixed(3) : ".000" },
              ] : [
                { label: "GP", val: st.gamesPlayed },
                { label: "W", val: st.wins },
                { label: "L", val: st.losses },
                { label: "OTL", val: st.otLosses },
                { label: "PTS", val: st.points },
              ]).map((s) => (
                <div key={s.label}>
                  <div className="text-[10px] text-gray-500 uppercase">{s.label}</div>
                  <div className="text-lg text-white font-bold">{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Home / Road splits (NHL has OTL, MLB does not) */}
          {(st.homeWins != null || st.roadWins != null) && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Home / Road Splits</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 text-xs mb-1">Home</div>
                  <div className="text-white font-semibold">
                    {st.homeWins ?? 0}-{st.homeLosses ?? 0}{!isMLB ? `-${st.homeOtLosses ?? 0}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">Road</div>
                  <div className="text-white font-semibold">
                    {st.roadWins ?? 0}-{st.roadLosses ?? 0}{!isMLB ? `-${st.roadOtLosses ?? 0}` : ""}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Streak */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Current Streak</div>
            <span className={`text-sm px-3 py-1 rounded-full border font-semibold ${streakColor}`}>
              {st.streakCode || "None"}
            </span>
          </div>

          {/* Stats */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Stats</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400 text-xs mb-1">{isMLB ? "Runs / Game" : "Goals / Game"}</div>
                <div className="text-white font-semibold">{goalsPerGame}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">{isMLB ? "Runs Against / Game" : "Goals Against / Game"}</div>
                <div className="text-white font-semibold">{goalsAgainstPerGame}</div>
              </div>
            </div>
          </div>

          {/* Last 10 Games */}
          {data!.recentGames.length > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Last {data!.recentGames.length} Games</div>
              <div className="space-y-2">
                {data!.recentGames.slice().reverse().map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-dark-border/30 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        g.win ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-accent-red"
                      }`}>
                        {g.win ? "W" : "L"}
                      </span>
                      <span className="text-gray-400 text-xs">{g.isHome ? "vs" : "@"}</span>
                      <span className="text-white text-xs font-medium">{g.opponentAbbrev || "???"}</span>
                    </div>
                    <div className="text-xs text-gray-300 font-medium">
                      {g.goalsFor}-{g.goalsAgainst}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Players */}
          {rosterPlayers.length > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Players</div>
              <div className="space-y-1">
                {rosterPlayers.map((p) => (
                  <Link
                    key={p.id}
                    href={`/player/${p.id}`}
                    className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-dark-bg/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {p.sweaterNumber && <span className="text-xs text-gray-500 w-5 text-right">#{p.sweaterNumber}</span>}
                      <span className="text-sm text-white">{p.firstName?.default} {p.lastName?.default}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${POS_COLORS[p.positionCode] || "bg-dark-bg text-gray-400 border-dark-border"}`}>
                      {POS_LABELS[p.positionCode] || p.positionCode}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
