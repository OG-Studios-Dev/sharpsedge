"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import TrendBadge, { computeBadgeLevel } from "@/components/TrendBadge";

type GameLog = {
  gameId: number;
  gameDate: string;
  homeRoadFlag: string;
  opponentAbbrev: string;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  plusMinus: number;
  toi: string; // "18:24"
};

type PlayerInfo = {
  playerId: number;
  firstName: { default: string };
  lastName: { default: string };
  sweaterNumber: number;
  positionCode: string;
  teamAbbrev: string;
  teamName: { default: string };
  headshot: string;
  heightInInches: number;
  weightInPounds: number;
  birthDate: string;
  birthCity: { default: string };
  birthCountry: string;
  draftYear?: number;
  draftRound?: number;
  draftPickInRound?: number;
  seasonStats?: {
    goals: number; assists: number; points: number;
    gamesPlayed: number; shots: number; plusMinus: number;
    pointsPerGame?: number;
  };
};

const POS_LABEL: Record<string, string> = {
  C: "Center", L: "Left Wing", R: "Right Wing", D: "Defenseman", G: "Goalie"
};

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center bg-dark-bg/60 rounded-[16px] px-2 py-3 border border-dark-border/40">
      <span className="text-white text-xl font-mono font-black drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">{value}</span>
      <span className="text-text-platinum/50 text-[9px] font-mono uppercase tracking-widest mt-1 font-bold">{label}</span>
    </div>
  );
}

function avg(vals: number[], n = vals.length): number {
  const slice = vals.slice(0, n);
  return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
}

function computeHitRate(vals: number[], line: number): number {
  if (!vals.length) return 0;
  return Math.round((vals.filter(v => v > line).length / vals.length) * 100);
}

function roundHalf(n: number): number { return Math.round(n * 2) / 2; }

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [gameLogs, setGameLogs] = useState<GameLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const BASE = "https://api-web.nhle.com/v1";

    Promise.all([
      fetch(`${BASE}/player/${id}/landing`).then(r => r.json()),
      fetch(`${BASE}/player/${id}/game-log/20252026/2`).then(r => r.json()),
    ])
      .then(([info, logs]) => {
        setPlayer(info);
        setGameLogs((logs.gameLog || []).slice(0, 20));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const goals = gameLogs.map(g => g.goals);
  const assists = gameLogs.map(g => g.assists);
  const points = gameLogs.map(g => g.points);
  const shots = gameLogs.map(g => g.shots);

  const propLines = [
    { label: "Points", vals: points, key: "points" as const },
    { label: "Goals", vals: goals, key: "goals" as const },
    { label: "Assists", vals: assists, key: "assists" as const },
    { label: "Shots", vals: shots, key: "shots" as const },
  ].map(({ label, vals, key }) => {
    const a = avg(vals, 10);
    const line = roundHalf(a);
    const hr = computeHitRate(vals, line);
    const badge = computeBadgeLevel(hr, vals, line, "Over");
    return { label, line, hr, badge, avg10: a.toFixed(1) };
  }).filter(p => p.line > 0);

  const name = player
    ? `${player.firstName?.default ?? ""} ${player.lastName?.default ?? ""}`
    : "Loading Identity...";
  const teamAbbrev = player?.teamAbbrev ?? "";
  const pos = player ? (POS_LABEL[player.positionCode] ?? player.positionCode) : "";
  const ss = player?.seasonStats;

  return (
    <main className="min-h-screen bg-dark-bg pb-32">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border/60 px-4 lg:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href={teamAbbrev ? `/team/${teamAbbrev}` : "/"} className="flex items-center justify-center w-8 h-8 rounded-full bg-dark-surface border border-dark-border/80 text-text-platinum/50 hover:text-white hover:bg-dark-card transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-heading font-black text-text-platinum tracking-tight truncate">{name}</h1>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 space-y-6">

          {/* Player Hero Card */}
          <div className="rounded-[32px] border border-dark-border/80 bg-gradient-to-br from-dark-surface/80 to-dark-bg p-6 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
            <div className="flex items-center gap-6 relative z-10">
              {player?.headshot ? (
                <div className="relative">
                    <img src={player.headshot} alt={name} className="w-24 h-24 rounded-full object-cover border-[3px] border-dark-border/80 bg-dark-bg shadow-xl" />
                    {teamAbbrev && (
                        <div className="absolute -bottom-2 -right-2 bg-dark-bg rounded-full p-1 border border-dark-border/60">
                            <TeamLogo team={teamAbbrev} size={24} />
                        </div>
                    )}
                </div>
              ) : (
                <TeamLogo team={teamAbbrev} size={80} />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-white text-3xl font-heading font-black tracking-tight truncate mb-1">{name}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {player?.sweaterNumber && (
                    <span className="text-[13px] font-mono font-bold text-text-platinum/60 bg-dark-bg/80 px-2 py-0.5 rounded border border-dark-border/60">#{player.sweaterNumber}</span>
                  )}
                  <span className="text-[11px] uppercase font-mono tracking-widest font-bold text-text-platinum/80">{pos}</span>
                  {teamAbbrev && (
                    <span className="text-[10px] font-mono tracking-widest font-bold px-2 py-0.5 rounded uppercase border bg-accent-blue/10 text-accent-blue border-accent-blue/20">{teamAbbrev}</span>
                  )}
                </div>
                {player?.birthDate && (
                  <p className="text-text-platinum/40 text-[11px] font-mono mt-3 mb-1">
                    {player.birthCity?.default}{player.birthCity?.default && ", "}{player.birthCountry}
                    {player.heightInInches && ` · ${Math.floor(player.heightInInches / 12)}′${player.heightInInches % 12}″`}
                    {player.weightInPounds && ` · ${player.weightInPounds} lbs`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
              {/* Season Stats */}
              {ss && ss.gamesPlayed > 0 && (
                <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 lg:col-span-1">
                  <p className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">2024–25 Season</p>
                  <div className="grid grid-cols-4 gap-3">
                    <StatBox label="GP" value={ss.gamesPlayed} />
                    <StatBox label="G" value={ss.goals} />
                    <StatBox label="A" value={ss.assists} />
                    <StatBox label="PTS" value={ss.points} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <StatBox label="Shots" value={ss.shots ?? "—"} />
                    <StatBox label="+/-" value={ss.plusMinus >= 0 ? `+${ss.plusMinus}` : ss.plusMinus} />
                    <StatBox label="P/GP" value={ss.gamesPlayed ? (ss.points / ss.gamesPlayed).toFixed(2) : "—"} />
                  </div>
                </div>
              )}

              {/* Prop Trend Lines */}
              {propLines.length > 0 && (
                <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 lg:col-span-1">
                  <p className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Prop Trend Lines <span className="text-accent-blue/60 ml-2">L{Math.min(gameLogs.length, 10)}</span></p>
                  <div className="space-y-3">
                    {propLines.map(p => (
                      <div key={p.label} className="flex items-center justify-between py-2 border-b border-dark-border/30 last:border-0">
                        <div>
                          <span className="text-text-platinum font-mono font-bold tracking-tight text-[15px]">O {p.line} <span className="text-text-platinum/60">{p.label}</span></span>
                          <div className="text-text-platinum/40 font-mono text-[10px] uppercase tracking-widest mt-0.5">AV {p.avg10}/G</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[15px] font-mono font-black tracking-tighter ${p.hr >= 70 ? "text-accent-green drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]" : p.hr >= 50 ? "text-white" : "text-text-platinum/40"}`}>
                            {p.hr}%
                          </span>
                          <TrendBadge level={p.badge} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-text-platinum/30 font-mono text-[9px] uppercase tracking-widest mt-4 text-center">% = hit rate in window</p>
                </div>
              )}

              {/* Last 10 Games */}
              {gameLogs.length > 0 && (
                <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 lg:col-span-1">
                  <p className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Last {Math.min(gameLogs.length, 10)} Games</p>
                  <div className="space-y-1">
                    {gameLogs.slice(0, 10).map((g, i) => (
                      <div key={g.gameId ?? i} className="flex items-center justify-between py-2.5 border-b border-dark-border/30 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-text-platinum/40 font-mono font-bold tracking-widest uppercase text-[10px] w-5">{g.homeRoadFlag === "H" ? "vs" : "@"}</span>
                          <TeamLogo team={g.opponentAbbrev} size={24} />
                          <span className="text-text-platinum font-heading font-black text-[14px]">{g.opponentAbbrev}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-text-platinum/40 font-mono">{g.toi}</span>
                          <span className="text-text-platinum/60 font-mono font-bold">{g.shots} <span className="text-[9px]">S</span ></span>
                          <span className={`font-mono font-black ${g.plusMinus >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                            {g.plusMinus >= 0 ? "+" : ""}{g.plusMinus}
                          </span>
                          <div className="text-right min-w-[56px] bg-dark-bg/60 px-2 py-0.5 rounded border border-dark-border/40">
                            <span className="text-white font-mono font-black">{g.goals}<span className="text-[10px] text-text-platinum/40">G</span> {g.assists}<span className="text-[10px] text-text-platinum/40">A</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {gameLogs.length === 0 && !loading && (
                <div className="text-center py-12 rounded-[24px] border border-dark-border/80 bg-dark-surface/40">
                  <p className="text-text-platinum/40 font-mono font-bold tracking-widest uppercase text-sm">No game log data available</p>
                </div>
              )}
          </div>
        </div>
      )}
    </main>
  );
}
