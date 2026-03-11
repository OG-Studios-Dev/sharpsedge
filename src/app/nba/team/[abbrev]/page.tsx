"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";

type NBATeamData = {
  teamAbbrev: string;
  teamName: string;
  teamColor: string;
  standing: {
    teamAbbrev: string;
    teamName: string;
    wins: number;
    losses: number;
    winPct: number;
    homeWins: number;
    homeLosses: number;
    awayWins: number;
    awayLosses: number;
    streak: string;
  } | null;
  roster: Array<{ id: number; name: string; position: string }>;
  recentGames: Array<{
    date: string;
    opponent: string;
    isHome: boolean;
    teamScore: number;
    oppScore: number;
    win: boolean;
  }>;
};

const POS_GROUP: Record<string, string> = {
  G: "Guards",
  "G-F": "Guards",
  F: "Forwards",
  "F-G": "Forwards",
  "F-C": "Forwards",
  C: "Centers",
};

const POS_COLORS: Record<string, string> = {
  Guards: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Forwards: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Centers: "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

export default function NBATeamPage() {
  const params = useParams<{ abbrev: string }>();
  const abbrev = (params.abbrev || "").toUpperCase();
  const [data, setData] = useState<NBATeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!abbrev) return;
    fetch(`/api/nba/team/${abbrev}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [abbrev]);

  const st = data?.standing;
  const color = data?.teamColor || "#4a9eff";
  const winPct = st ? (st.winPct * 100).toFixed(1) : "-";

  const streakChar = st?.streak?.charAt(0);
  const streakColor =
    streakChar === "W" ? "bg-accent-green/20 text-accent-green border-accent-green/30" :
    streakChar === "L" ? "bg-accent-red/20 text-accent-red border-accent-red/30" :
    "bg-dark-bg text-gray-400 border-dark-border";

  // Group roster by position
  const groupedRoster: Record<string, Array<{ id: number; name: string; position: string }>> = {};
  for (const p of data?.roster || []) {
    const group = POS_GROUP[p.position] || "Other";
    if (!groupedRoster[group]) groupedRoster[group] = [];
    groupedRoster[group].push(p);
  }

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/schedule" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-white">{data?.teamName || abbrev}</h1>
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
            <TeamLogo team={abbrev} size={64} color={color} />
            <div>
              <div className="text-white text-2xl font-bold">{st.teamName}</div>
              <div className="text-sm text-gray-400">NBA &middot; {winPct}% Win Rate</div>
            </div>
          </div>

          {/* Record */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Record</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "W", val: st.wins },
                { label: "L", val: st.losses },
                { label: "PCT", val: `${(st.winPct * 100).toFixed(0)}%` },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[10px] text-gray-500 uppercase">{s.label}</div>
                  <div className="text-lg text-white font-bold">{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Home / Road splits */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Home / Road Splits</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400 text-xs mb-1">Home</div>
                <div className="text-white font-semibold">{st.homeWins}-{st.homeLosses}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-1">Road</div>
                <div className="text-white font-semibold">{st.awayWins}-{st.awayLosses}</div>
              </div>
            </div>
          </div>

          {/* Streak */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Current Streak</div>
            <span className={`text-sm px-3 py-1 rounded-full border font-semibold ${streakColor}`}>
              {st.streak || "None"}
            </span>
          </div>

          {/* Recent Games */}
          {data!.recentGames.length > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">
                Last {data!.recentGames.length} Games
              </div>
              <div className="space-y-2">
                {data!.recentGames.map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-dark-border/30 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        g.win ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-accent-red"
                      }`}>
                        {g.win ? "W" : "L"}
                      </span>
                      <span className="text-gray-400 text-xs">{g.isHome ? "vs" : "@"}</span>
                      <span className="text-white text-xs font-medium">{g.opponent}</span>
                    </div>
                    <div className="text-xs text-gray-300 font-medium">
                      {g.teamScore}-{g.oppScore}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roster by Position */}
          {Object.keys(groupedRoster).length > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Roster</div>
              {Object.entries(groupedRoster).map(([group, players]) => (
                <div key={group} className="mb-3 last:mb-0">
                  <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-1.5">{group}</p>
                  <div className="space-y-1">
                    {players.slice(0, 8).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2 px-1 rounded-lg"
                      >
                        <span className="text-sm text-white">{p.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${POS_COLORS[group] || "bg-dark-bg text-gray-400 border-dark-border"}`}>
                          {p.position || group}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
