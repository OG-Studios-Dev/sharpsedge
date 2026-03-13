"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";

type MatchupTeam = {
  abbreviation: string;
  fullName: string;
  score: number | null;
  color: string;
};

type Standing = {
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
};

type MatchupData = {
  game: {
    id: number;
    date: string;
    status: string;
    homeTeam: MatchupTeam;
    awayTeam: MatchupTeam;
  };
  homeStanding: Standing | null;
  awayStanding: Standing | null;
};

export default function NBAMatchupPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId || "";
  const [data, setData] = useState<MatchupData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    fetch(`/api/nba/matchup/${gameId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameId]);

  const game = data?.game;
  const awayAbbrev = game?.awayTeam.abbreviation || "";
  const homeAbbrev = game?.homeTeam.abbreviation || "";
  const awayColor = game?.awayTeam.color || "#334155";
  const homeColor = game?.homeTeam.color || "#334155";

  const statusLabel = game
    ? game.status === "Live"
      ? "LIVE"
      : game.status === "Final"
        ? `Final${game.awayTeam.score !== null ? ` ${game.awayTeam.score}-${game.homeTeam.score}` : ""}`
        : game.status
    : "";

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/schedule" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-white">NBA Matchup</h1>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-12">Loading matchup...</p>
      ) : !game ? (
        <p className="text-sm text-gray-500 text-center py-12">Matchup not found.</p>
      ) : (
        <div className="px-4 py-6 space-y-5">
          {/* Hero: Away @ Home */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div className="flex flex-col items-center text-center gap-2">
                <TeamLogo team={awayAbbrev} size={56} color={awayColor} />
                <div className="text-white font-bold text-sm">{awayAbbrev}</div>
                {game.awayTeam.score !== null && (
                  <div className="text-2xl text-white font-bold">{game.awayTeam.score}</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">at</div>
                <div className="text-[11px] text-gray-400">{statusLabel}</div>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <TeamLogo team={homeAbbrev} size={56} color={homeColor} />
                <div className="text-white font-bold text-sm">{homeAbbrev}</div>
                {game.homeTeam.score !== null && (
                  <div className="text-2xl text-white font-bold">{game.homeTeam.score}</div>
                )}
              </div>
            </div>
          </div>

          {/* Lineups placeholder */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3 text-center">Starting Lineups</div>
            <p className="text-center text-gray-500 text-xs">TBD — lineups confirmed closer to tip-off</p>
          </div>

          {/* Season Records */}
          {(data?.awayStanding || data?.homeStanding) && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Season Records</div>
              <div className="grid grid-cols-2 gap-4">
                {data?.awayStanding && (
                  <div>
                    <div className="text-xs text-gray-400 mb-1">{awayAbbrev}</div>
                    <div className="text-sm text-white font-semibold">
                      {data.awayStanding.wins}-{data.awayStanding.losses} ({(data.awayStanding.winPct * 100).toFixed(0)}%)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Road: {data.awayStanding.awayWins}-{data.awayStanding.awayLosses}
                    </div>
                  </div>
                )}
                {data?.homeStanding && (
                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">{homeAbbrev}</div>
                    <div className="text-sm text-white font-semibold">
                      {data.homeStanding.wins}-{data.homeStanding.losses} ({(data.homeStanding.winPct * 100).toFixed(0)}%)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Home: {data.homeStanding.homeWins}-{data.homeStanding.homeLosses}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* H2H */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Head to Head</div>
            <p className="text-gray-500 text-xs text-center">H2H data loading — check back after more games are played</p>
          </div>

          {/* Team Links */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/nba/team/${awayAbbrev}`}
              className="rounded-2xl border border-dark-border bg-dark-surface p-4 hover:border-gray-600 transition-colors text-center"
            >
              <TeamLogo team={awayAbbrev} size={40} color={awayColor} className="mx-auto mb-2" />
              <div className="text-sm text-white font-semibold">{game.awayTeam.fullName || awayAbbrev}</div>
              <div className="text-[11px] text-accent-blue mt-1">View Team &rarr;</div>
            </Link>
            <Link
              href={`/nba/team/${homeAbbrev}`}
              className="rounded-2xl border border-dark-border bg-dark-surface p-4 hover:border-gray-600 transition-colors text-center"
            >
              <TeamLogo team={homeAbbrev} size={40} color={homeColor} className="mx-auto mb-2" />
              <div className="text-sm text-white font-semibold">{game.homeTeam.fullName || homeAbbrev}</div>
              <div className="text-[11px] text-accent-blue mt-1">View Team &rarr;</div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
