"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { NHL_TEAM_COLORS } from "@/lib/nhl-api";
import type { GoalieStarter, TeamStandingRow, TeamRecentGame } from "@/lib/nhl-api";
import type { NHLGame } from "@/lib/types";

type MatchupData = {
  goalies: { gameId: number; home: GoalieStarter | null; away: GoalieStarter | null };
  homeStanding: TeamStandingRow | null;
  awayStanding: TeamStandingRow | null;
  homeRecentGames: TeamRecentGame[];
  awayRecentGames: TeamRecentGame[];
};

function GoalieCard({ goalie, side }: { goalie: GoalieStarter | null; side: "home" | "away" }) {
  if (!goalie) return <div className="text-sm text-gray-600">TBD</div>;
  const statusColor =
    goalie.status === "confirmed" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
    goalie.status === "probable" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" :
    "text-gray-400 border-gray-500/30 bg-gray-500/10";
  const statusLabel = goalie.status === "confirmed" ? "Confirmed" : goalie.status === "probable" ? "Probable" : "TBD";

  return (
    <div className={side === "away" ? "text-left" : "text-right"}>
      <div className="flex items-center gap-1.5 flex-wrap" style={{ justifyContent: side === "away" ? "flex-start" : "flex-end" }}>
        <span className="text-sm text-white font-medium">{goalie.name}</span>
        {goalie.isBackup && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold uppercase tracking-wider">Backup</span>
        )}
      </div>
      <div className="text-[11px] text-gray-400 mt-1">
        SV% {goalie.savePct.toFixed(3)} &middot; GAA {goalie.gaa.toFixed(2)}
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">
        {goalie.wins}W-{goalie.losses}L-{goalie.otLosses}OTL
      </div>
      <span className={`inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full border ${statusColor}`}>{statusLabel}</span>
    </div>
  );
}

function Last5({ games, label }: { games: TeamRecentGame[]; label: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">{label}</div>
      <div className="space-y-1.5">
        {games.slice().reverse().map((g, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                g.win ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-accent-red"
              }`}>
                {g.win ? "W" : "L"}
              </span>
              <span className="text-gray-400">{g.isHome ? "vs" : "@"} {g.opponentAbbrev}</span>
            </div>
            <span className="text-gray-300 font-medium">{g.goalsFor}-{g.goalsAgainst}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchupPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId || "";
  const [matchup, setMatchup] = useState<MatchupData | null>(null);
  const [game, setGame] = useState<NHLGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    const fetchAll = async () => {
      try {
        const [matchupRes, scheduleRes] = await Promise.all([
          fetch(`/api/matchup/${gameId}`).then((r) => r.json()),
          fetch("/api/schedule").then((r) => r.json()),
        ]);
        setMatchup(matchupRes);
        const found = (scheduleRes?.games || []).find((g: NHLGame) => String(g.id) === String(gameId));
        setGame(found || null);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [gameId]);

  const awayAbbrev = game?.awayTeam.abbrev || matchup?.goalies?.away?.team || "";
  const homeAbbrev = game?.homeTeam.abbrev || matchup?.goalies?.home?.team || "";
  const awayColor = NHL_TEAM_COLORS[awayAbbrev] || "#334155";
  const homeColor = NHL_TEAM_COLORS[homeAbbrev] || "#334155";

  const gameStateLabel = game
    ? game.gameState === "LIVE" || game.gameState === "CRIT"
      ? "LIVE"
      : game.gameState === "OFF" || game.gameState === "FINAL"
        ? `Final${game.awayTeam.score !== undefined ? ` ${game.awayTeam.score}-${game.homeTeam.score}` : ""}`
        : new Date(game.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  const hasBackup = matchup?.goalies?.home?.isBackup || matchup?.goalies?.away?.isBackup;
  const backupTeam = matchup?.goalies?.home?.isBackup
    ? (matchup.homeStanding?.teamName || homeAbbrev)
    : matchup?.goalies?.away?.isBackup
      ? (matchup.awayStanding?.teamName || awayAbbrev)
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
          <h1 className="text-xl font-bold text-white">Matchup</h1>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-12">Loading matchup...</p>
      ) : (
        <div className="px-4 py-6 space-y-5">
          {/* Hero: Away @ Home */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div className="flex flex-col items-center text-center gap-2">
                <TeamLogo team={awayAbbrev} logo={game?.awayTeam.logo} size={56} color={awayColor} />
                <div className="text-white font-bold text-sm">{awayAbbrev}</div>
                {game?.awayTeam.score !== undefined && (
                  <div className="text-2xl text-white font-bold">{game.awayTeam.score}</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">at</div>
                <div className="text-[11px] text-gray-400">{gameStateLabel}</div>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <TeamLogo team={homeAbbrev} logo={game?.homeTeam.logo} size={56} color={homeColor} />
                <div className="text-white font-bold text-sm">{homeAbbrev}</div>
                {game?.homeTeam.score !== undefined && (
                  <div className="text-2xl text-white font-bold">{game.homeTeam.score}</div>
                )}
              </div>
            </div>
          </div>

          {/* Starting Goalies */}
          {(matchup?.goalies?.away || matchup?.goalies?.home) && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3 text-center">Starting Goalies</div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                <GoalieCard goalie={matchup?.goalies?.away || null} side="away" />
                <div className="text-xs text-gray-600 pt-2">vs</div>
                <GoalieCard goalie={matchup?.goalies?.home || null} side="home" />
              </div>
            </div>
          )}

          {/* AI Edge Note - Backup */}
          {hasBackup && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="text-sm text-yellow-300 font-semibold">
                Backup goalie starting for {backupTeam} — elevated edge on Goals and Shots props
              </div>
            </div>
          )}

          {/* Season Records */}
          {(matchup?.awayStanding || matchup?.homeStanding) && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Season Records</div>
              <div className="grid grid-cols-2 gap-4">
                {matchup?.awayStanding && (
                  <div>
                    <div className="text-xs text-gray-400 mb-1">{awayAbbrev}</div>
                    <div className="text-sm text-white font-semibold">
                      {matchup.awayStanding.wins}-{matchup.awayStanding.losses}-{matchup.awayStanding.otLosses} ({matchup.awayStanding.points} pts)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Road: {matchup.awayStanding.roadWins}-{matchup.awayStanding.roadLosses}-{matchup.awayStanding.roadOtLosses}
                    </div>
                  </div>
                )}
                {matchup?.homeStanding && (
                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">{homeAbbrev}</div>
                    <div className="text-sm text-white font-semibold">
                      {matchup.homeStanding.wins}-{matchup.homeStanding.losses}-{matchup.homeStanding.otLosses} ({matchup.homeStanding.points} pts)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Home: {matchup.homeStanding.homeWins}-{matchup.homeStanding.homeLosses}-{matchup.homeStanding.homeOtLosses}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Last 5 Results */}
          {(matchup?.awayRecentGames?.length || matchup?.homeRecentGames?.length) ? (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3">Last 5 Results</div>
              <div className="grid grid-cols-2 gap-4">
                <Last5 games={matchup?.awayRecentGames || []} label={`${awayAbbrev} (Away)`} />
                <Last5 games={matchup?.homeRecentGames || []} label={`${homeAbbrev} (Home)`} />
              </div>
            </div>
          ) : null}

          {/* Team Links */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/team/${awayAbbrev}`}
              className="rounded-2xl border border-dark-border bg-dark-surface p-4 hover:border-gray-600 transition-colors text-center"
            >
              <TeamLogo team={awayAbbrev} logo={game?.awayTeam.logo} size={40} color={awayColor} className="mx-auto mb-2" />
              <div className="text-sm text-white font-semibold">{matchup?.awayStanding?.teamName || awayAbbrev}</div>
              <div className="text-[11px] text-accent-blue mt-1">View Team →</div>
            </Link>
            <Link
              href={`/team/${homeAbbrev}`}
              className="rounded-2xl border border-dark-border bg-dark-surface p-4 hover:border-gray-600 transition-colors text-center"
            >
              <TeamLogo team={homeAbbrev} logo={game?.homeTeam.logo} size={40} color={homeColor} className="mx-auto mb-2" />
              <div className="text-sm text-white font-semibold">{matchup?.homeStanding?.teamName || homeAbbrev}</div>
              <div className="text-[11px] text-accent-blue mt-1">View Team →</div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
