"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { NHL_TEAM_COLORS } from "@/lib/nhl-api";
import type { TeamStandingRow, TeamRecentGame } from "@/lib/nhl-api";

type RosterPlayer = {
  id: number;
  firstName: { default: string };
  lastName: { default: string };
  positionCode: string;
  sweaterNumber?: number;
};

type TeamData = {
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
  const color = NHL_TEAM_COLORS[abbrev] || "#4a9eff";
  const goalsPerGame = st ? (st.goalsFor / st.gamesPlayed).toFixed(1) : "-";
  const goalsAgainstPerGame = st ? (st.goalsAgainst / st.gamesPlayed).toFixed(1) : "-";

  const streakType = st?.streakCode?.charAt(0);
  const streakColor =
    streakType === "W" ? "bg-accent-green/10 text-accent-green border-accent-green/20 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]" :
    streakType === "L" ? "bg-accent-red/10 text-accent-red border-accent-red/20" :
    "bg-dark-bg/50 text-text-platinum/50 border-dark-border/60";

  const skaters = (data?.roster || []).filter((p) => p.positionCode !== "G").slice(0, 10);

  return (
    <main className="min-h-screen bg-dark-bg pb-32">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border/60 px-4 lg:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/teams" className="flex items-center justify-center w-8 h-8 rounded-full bg-dark-surface border border-dark-border/80 text-text-platinum/50 hover:text-white hover:bg-dark-card transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-heading font-black text-text-platinum tracking-tight">{st?.teamName || abbrev}</h1>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
        </div>
      ) : !st ? (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="text-4xl text-text-platinum/30 mb-4">👻</div>
            <p className="text-text-platinum font-heading font-bold text-lg">Team not found.</p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 space-y-6">
          {/* Hero */}
          <div className="flex items-center gap-5 bg-gradient-to-br from-dark-surface/60 to-dark-bg p-6 rounded-[32px] border border-dark-border/80 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] overflow-hidden relative">
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ backgroundColor: color }} />
            
            <TeamLogo team={abbrev} logo={st.logo} size={84} color={color} />
            <div className="relative z-10">
              <div className="text-white text-3xl font-heading font-black tracking-tight">{st.teamName}</div>
              <div className="text-sm font-mono text-text-platinum/50 mt-1 uppercase tracking-widest font-bold">
                {st.conferenceName} &middot; {st.divisionName}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
              {/* Record */}
              <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5">
                <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Record</div>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {[
                    { label: "GP", val: st.gamesPlayed },
                    { label: "W", val: st.wins, color: "text-accent-green" },
                    { label: "L", val: st.losses, color: "text-accent-red" },
                    { label: "OTL", val: st.otLosses },
                    { label: "PTS", val: st.points, color: "text-accent-blue drop-shadow-[0_0_8px_rgba(74,158,255,0.3)]" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="text-[10px] text-text-platinum/50 font-mono mb-1">{s.label}</div>
                      <div className={`text-xl font-mono font-black ${s.color || "text-text-platinum"}`}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Home / Road splits */}
              <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5">
                <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Home / Road Splits</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-bg/50 rounded-xl p-3 border border-dark-border/40 text-center">
                    <div className="text-text-platinum/40 text-[10px] font-mono uppercase tracking-widest mb-1">Home</div>
                    <div className="text-text-platinum font-mono font-bold">{st.homeWins}-{st.homeLosses}-{st.homeOtLosses}</div>
                  </div>
                  <div className="bg-dark-bg/50 rounded-xl p-3 border border-dark-border/40 text-center">
                    <div className="text-text-platinum/40 text-[10px] font-mono uppercase tracking-widest mb-1">Road</div>
                    <div className="text-text-platinum font-mono font-bold">{st.roadWins}-{st.roadLosses}-{st.roadOtLosses}</div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5">
                <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Stats</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-bg/50 rounded-xl p-3 border border-dark-border/40 text-center flex flex-col justify-center">
                    <div className="text-text-platinum/40 text-[10px] font-mono uppercase tracking-widest mb-1">Goals/G</div>
                    <div className="text-text-platinum font-mono font-black text-xl">{goalsPerGame}</div>
                  </div>
                  <div className="bg-dark-bg/50 rounded-xl p-3 border border-dark-border/40 text-center flex flex-col justify-center">
                    <div className="text-text-platinum/40 text-[10px] font-mono uppercase tracking-widest mb-1">Against/G</div>
                    <div className="text-text-platinum font-mono font-black text-xl">{goalsAgainstPerGame}</div>
                  </div>
                </div>
              </div>

              {/* Streak */}
              <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 flex flex-col">
                <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Current Streak</div>
                <div className="flex-1 flex items-center justify-center">
                    <span className={`text-xl font-mono px-6 py-2 rounded-xl border-2 font-black tracking-widest ${streakColor}`}>
                        {st.streakCode || "NONE"}
                    </span>
                </div>
              </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 items-start pt-4">
              {/* Last 10 Games */}
              {data!.recentGames.length > 0 && (
                <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5">
                  <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Last {data!.recentGames.length} Games</div>
                  <div className="space-y-2">
                    {data!.recentGames.slice().reverse().map((g, i) => (
                      <div key={i} className="flex items-center justify-between text-[13px] py-2 border-b border-dark-border/40 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black font-mono tracking-tighter ${
                            g.win ? "bg-accent-green/10 text-accent-green border border-accent-green/20" : "bg-accent-red/10 text-accent-red border border-accent-red/20"
                          }`}>
                            {g.win ? "W" : "L"}
                          </span>
                          <span className="text-text-platinum/40 font-mono font-bold tracking-widest uppercase text-[10px]">{g.isHome ? "vs" : "@"}</span>
                          <span className="text-text-platinum font-heading font-bold">{g.opponentAbbrev || "???"}</span>
                        </div>
                        <div className="text-sm text-text-platinum/70 font-mono font-bold">
                          {g.goalsFor}-{g.goalsAgainst}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Players */}
              {skaters.length > 0 && (
                <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5">
                  <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Players</div>
                  <div className="space-y-[2px]">
                    {skaters.map((p) => (
                      <Link
                        key={p.id}
                        href={`/player/${p.id}`}
                        className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-dark-bg/60 border border-transparent hover:border-dark-border/60 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono font-bold text-text-platinum/30 w-5 text-right">
                              {p.sweaterNumber ? `#${p.sweaterNumber}` : ""}
                          </span>
                          <span className="text-[14px] font-heading font-bold text-text-platinum group-hover:text-white transition-colors">{p.firstName?.default} {p.lastName?.default}</span>
                        </div>
                        <span className={`text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${POS_COLORS[p.positionCode] || "bg-dark-bg text-gray-400 border-dark-border"}`}>
                          {POS_LABELS[p.positionCode] || p.positionCode}
                        </span>
                      </Link>
                    ))}
                  </div>
                  <p className="text-center mt-4">
                      <Link href={`/roster/${abbrev}`} className="text-[11px] font-mono font-bold uppercase tracking-widest text-accent-blue hover:text-white transition-colors">
                          View Full Roster &rarr;
                      </Link>
                  </p>
                </div>
              )}
          </div>
        </div>
      )}
    </main>
  );
}
