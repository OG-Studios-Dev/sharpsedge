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
    <div className="flex flex-col items-center bg-dark-bg/60 rounded-xl px-4 py-3 border border-dark-border/50">
      <span className="text-white text-xl font-bold">{value}</span>
      <span className="text-gray-500 text-[10px] uppercase tracking-wider mt-0.5">{label}</span>
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
    : "Player";
  const teamAbbrev = player?.teamAbbrev ?? "";
  const pos = player ? (POS_LABEL[player.positionCode] ?? player.positionCode) : "";
  const ss = player?.seasonStats;

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={teamAbbrev ? `/team/${teamAbbrev}` : "/"} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-white truncate">{name}</h1>
        </div>
      </header>

      {loading ? (
        <div className="px-4 py-6 space-y-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-dark-border/40 animate-pulse" />)}
        </div>
      ) : (
        <div className="px-4 py-5 space-y-4">

          {/* Player Card */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="flex items-center gap-4">
              {player?.headshot ? (
                <img src={player.headshot} alt={name} className="w-16 h-16 rounded-full object-cover border-2 border-dark-border" />
              ) : (
                <TeamLogo team={teamAbbrev} size={56} sport="NHL" />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-white text-lg font-bold truncate">{name}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {player?.sweaterNumber && (
                    <span className="text-gray-400 text-sm">#{player.sweaterNumber}</span>
                  )}
                  <span className="text-gray-400 text-sm">{pos}</span>
                  {teamAbbrev && (
                    <span className="text-accent-blue text-sm font-medium">{teamAbbrev}</span>
                  )}
                </div>
                {player?.birthDate && (
                  <p className="text-gray-600 text-xs mt-1">
                    {player.birthCity?.default}{player.birthCity?.default && ", "}{player.birthCountry}
                    {player.heightInInches && ` · ${Math.floor(player.heightInInches / 12)}′${player.heightInInches % 12}″`}
                    {player.weightInPounds && ` · ${player.weightInPounds} lbs`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Season Stats */}
          {ss && ss.gamesPlayed > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">2024–25 Season</p>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="GP" value={ss.gamesPlayed} />
                <StatBox label="G" value={ss.goals} />
                <StatBox label="A" value={ss.assists} />
                <StatBox label="PTS" value={ss.points} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <StatBox label="Shots" value={ss.shots ?? "—"} />
                <StatBox label="+/-" value={ss.plusMinus >= 0 ? `+${ss.plusMinus}` : ss.plusMinus} />
                <StatBox label="P/GP" value={ss.gamesPlayed ? (ss.points / ss.gamesPlayed).toFixed(2) : "—"} />
              </div>
            </div>
          )}

          {/* Prop Trend Lines */}
          {propLines.length > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Prop Trend Lines (L{Math.min(gameLogs.length, 10)})</p>
              <div className="space-y-2">
                {propLines.map(p => (
                  <div key={p.label} className="flex items-center justify-between py-2 border-b border-dark-border/30 last:border-0">
                    <div>
                      <span className="text-white text-sm font-semibold">Over {p.line} {p.label}</span>
                      <span className="text-gray-500 text-xs ml-2">avg {p.avg10}/gm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${p.hr >= 70 ? "text-emerald-400" : p.hr >= 50 ? "text-white" : "text-gray-400"}`}>
                        {p.hr}%
                      </span>
                      <TrendBadge level={p.badge} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-gray-600 text-[10px] mt-3">% = hit rate last {Math.min(gameLogs.length, 10)} games</p>
            </div>
          )}

          {/* Last 10 Games */}
          {gameLogs.length > 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Last {Math.min(gameLogs.length, 10)} Games</p>
              <div className="space-y-0">
                {gameLogs.slice(0, 10).map((g, i) => (
                  <div key={g.gameId ?? i} className="flex items-center justify-between py-2 border-b border-dark-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-6">{g.homeRoadFlag === "H" ? "vs" : "@"}</span>
                      <TeamLogo team={g.opponentAbbrev} size={20} sport="NHL" />
                      <span className="text-white text-xs font-medium">{g.opponentAbbrev}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400">{g.toi}</span>
                      <span className="text-gray-400">{g.shots} SOG</span>
                      <span className={`font-semibold ${g.plusMinus >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {g.plusMinus >= 0 ? "+" : ""}{g.plusMinus}
                      </span>
                      <div className="text-right min-w-[48px]">
                        <span className="text-white font-bold">{g.goals}G {g.assists}A</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gameLogs.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No game log data available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
