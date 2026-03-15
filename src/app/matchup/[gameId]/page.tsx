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
  if (!goalie) return <div className="text-sm font-mono text-text-platinum/50 font-bold tracking-widest uppercase">TBD</div>;
  const statusColor =
    goalie.status === "confirmed" ? "text-accent-green bg-accent-green/10 border-accent-green/20 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]" :
    goalie.status === "probable" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20 drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]" :
    "text-text-platinum/50 bg-dark-bg/50 border-dark-border/60";
  const statusLabel = goalie.status === "confirmed" ? "Confirmed" : goalie.status === "probable" ? "Probable" : "TBD";

  return (
    <div className={side === "away" ? "text-left" : "text-right"}>
      <div className="flex items-center gap-2 flex-wrap mb-1" style={{ justifyContent: side === "away" ? "flex-start" : "flex-end" }}>
        <span className="text-[14px] font-heading font-black text-white">{goalie.name}</span>
        {goalie.isBackup && (
          <span className="text-[9px] px-2 py-0.5 rounded border bg-accent-red/10 border-accent-red/20 text-accent-red font-mono font-bold uppercase tracking-widest">Backup</span>
        )}
      </div>
      <div className="text-[11px] font-mono font-bold text-text-platinum/60">
        SV% <span className="text-white">{goalie.savePct.toFixed(3)}</span> &middot; GAA <span className="text-white">{goalie.gaa.toFixed(2)}</span>
      </div>
      <div className="text-[10px] font-mono font-bold text-text-platinum/40 mt-0.5 mb-2 uppercase tracking-widest">
        {goalie.wins}W-{goalie.losses}L-{goalie.otLosses}OTL
      </div>
      <span className={`inline-block text-[9px] px-2 py-0.5 rounded border font-mono font-bold uppercase tracking-widest ${statusColor}`}>{statusLabel}</span>
    </div>
  );
}

function Last5({ games, label }: { games: TeamRecentGame[]; label: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-3">{label}</div>
      <div className="space-y-2">
        {games.slice().reverse().map((g, i) => (
          <div key={i} className="flex items-center justify-between text-[13px] py-1 border-b border-dark-border/30 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black font-mono tracking-tighter ${
                g.win ? "bg-accent-green/10 text-accent-green border border-accent-green/20" : "bg-accent-red/10 text-accent-red border border-accent-red/20"
              }`}>
                {g.win ? "W" : "L"}
              </span>
              <span className="text-text-platinum/40 font-mono font-bold tracking-widest uppercase text-[9px]">{g.isHome ? "vs" : "@"} <span className="text-text-platinum font-heading">{g.opponentAbbrev}</span></span>
            </div>
            <span className="text-text-platinum/80 font-mono font-bold text-xs">{g.goalsFor}-{g.goalsAgainst}</span>
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
      ? <span className="text-accent-red font-black tracking-widest drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">LIVE</span>
      : game.gameState === "OFF" || game.gameState === "FINAL"
        ? `FINAL`
        : new Date(game.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  const hasBackup = matchup?.goalies?.home?.isBackup || matchup?.goalies?.away?.isBackup;
  const backupTeam = matchup?.goalies?.home?.isBackup
    ? (matchup.homeStanding?.teamName || homeAbbrev)
    : matchup?.goalies?.away?.isBackup
      ? (matchup.awayStanding?.teamName || awayAbbrev)
      : "";

  return (
    <main className="min-h-screen bg-dark-bg pb-32">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border/60 px-4 lg:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/schedule" className="flex items-center justify-center w-8 h-8 rounded-full bg-dark-surface border border-dark-border/80 text-text-platinum/50 hover:text-white hover:bg-dark-card transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-heading font-black text-text-platinum tracking-tight">Matchup Central</h1>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 space-y-6">
          {/* Hero: Away @ Home */}
          <div className="rounded-[32px] border border-dark-border/80 bg-gradient-to-b from-dark-surface/60 to-dark-bg p-6 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
            <div className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ backgroundColor: awayColor }} />
            <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" style={{ backgroundColor: homeColor }} />

            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center relative z-10">
              <div className="flex flex-col items-center text-center gap-2">
                <TeamLogo team={awayAbbrev} logo={game?.awayTeam.logo} size={64} color={awayColor} />
                <div className="text-text-platinum font-heading font-black text-lg tracking-tight">{awayAbbrev}</div>
                {game?.awayTeam.score !== undefined && (
                  <div className="text-4xl text-white font-mono font-black drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{game.awayTeam.score}</div>
                )}
              </div>
              <div className="text-center px-4">
                <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-2">VS</div>
                <div className="text-sm font-mono font-bold text-text-platinum/70">{gameStateLabel}</div>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <TeamLogo team={homeAbbrev} logo={game?.homeTeam.logo} size={64} color={homeColor} />
                <div className="text-text-platinum font-heading font-black text-lg tracking-tight">{homeAbbrev}</div>
                {game?.homeTeam.score !== undefined && (
                  <div className="text-4xl text-white font-mono font-black drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{game.homeTeam.score}</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
              {/* Starting Goalies */}
              {(matchup?.goalies?.away || matchup?.goalies?.home) && (
                <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 lg:col-span-1">
                  <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4 text-center">Starting Goalies</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
                    <GoalieCard goalie={matchup?.goalies?.away || null} side="away" />
                    <div className="text-[10px] font-mono font-bold text-text-platinum/30 pt-3">VS</div>
                    <GoalieCard goalie={matchup?.goalies?.home || null} side="home" />
                  </div>
                </div>
              )}

              {/* AI Edge Note - Backup */}
              {hasBackup && (
                <div className="rounded-[16px] border border-yellow-400/30 bg-yellow-400/10 p-4 lg:col-span-1 shadow-[0_0_20px_rgba(250,204,21,0.05)]">
                  <div className="flex gap-3 items-center">
                      <span className="text-yellow-400 text-xl drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">✨</span>
                      <div className="text-sm text-yellow-100/90 font-mono">
                        <span className="font-bold text-yellow-400">EDGE SIGNAL:</span> Backup goalie starting for {backupTeam}. Expectations for Goals and Shots props are elevated.
                      </div>
                  </div>
                </div>
              )}

              <div className="grid gap-6 sm:grid-cols-2 lg:col-span-1">
                  {/* Season Records */}
                  {(matchup?.awayStanding || matchup?.homeStanding) && (
                    <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 sm:col-span-2">
                      <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4 text-center">Season Records</div>
                      <div className="grid grid-cols-2 gap-6 relative">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-dark-border/40" />
                        {matchup?.awayStanding && (
                          <div className="pr-2 text-center">
                            <div className="text-xs font-mono font-bold text-text-platinum/50 mb-1">{awayAbbrev}</div>
                            <div className="text-lg text-white font-mono font-black tracking-tight">
                              {matchup.awayStanding.wins}-{matchup.awayStanding.losses}-{matchup.awayStanding.otLosses}
                            </div>
                            <div className="text-[10px] text-accent-blue font-mono font-bold uppercase tracking-widest mt-0.5 mb-2">
                              {matchup.awayStanding.points} pts
                            </div>
                            <div className="inline-block bg-dark-bg/60 rounded-lg px-3 py-1.5 border border-dark-border/40">
                                <div className="text-[9px] text-text-platinum/40 font-mono uppercase tracking-widest mb-0.5">Road</div>
                                <div className="text-xs text-text-platinum font-mono font-bold">
                                {matchup.awayStanding.roadWins}-{matchup.awayStanding.roadLosses}-{matchup.awayStanding.roadOtLosses}
                                </div>
                            </div>
                          </div>
                        )}
                        {matchup?.homeStanding && (
                          <div className="pl-2 text-center">
                            <div className="text-xs font-mono font-bold text-text-platinum/50 mb-1">{homeAbbrev}</div>
                            <div className="text-lg text-white font-mono font-black tracking-tight">
                              {matchup.homeStanding.wins}-{matchup.homeStanding.losses}-{matchup.homeStanding.otLosses}
                            </div>
                            <div className="text-[10px] text-accent-blue font-mono font-bold uppercase tracking-widest mt-0.5 mb-2">
                              {matchup.homeStanding.points} pts
                            </div>
                            <div className="inline-block bg-dark-bg/60 rounded-lg px-3 py-1.5 border border-dark-border/40">
                                <div className="text-[9px] text-text-platinum/40 font-mono uppercase tracking-widest mb-0.5">Home</div>
                                <div className="text-xs text-text-platinum font-mono font-bold">
                                {matchup.homeStanding.homeWins}-{matchup.homeStanding.homeLosses}-{matchup.homeStanding.homeOtLosses}
                                </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Last 5 Results */}
                  {(matchup?.awayRecentGames?.length || matchup?.homeRecentGames?.length) ? (
                    <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 sm:col-span-2">
                      <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4 text-center">Last 5 Results</div>
                      <div className="grid grid-cols-2 gap-6 relative">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-dark-border/40" />
                        <div className="pr-2">
                            <Last5 games={matchup?.awayRecentGames || []} label={awayAbbrev} />
                        </div>
                        <div className="pl-2">
                            <Last5 games={matchup?.homeRecentGames || []} label={homeAbbrev} />
                        </div>
                      </div>
                    </div>
                  ) : null}
              </div>
          </div>

          {/* Team Links */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <Link
              href={`/team/${awayAbbrev}`}
              className="group rounded-[20px] border border-dark-border/60 bg-dark-surface/60 p-5 hover:bg-dark-surface hover:border-accent-blue/40 transition-all text-center"
            >
              <TeamLogo team={awayAbbrev} logo={game?.awayTeam.logo} size={48} color={awayColor} className="mx-auto mb-3" />
              <div className="text-[15px] font-heading font-black text-text-platinum group-hover:text-white transition-colors">{matchup?.awayStanding?.teamName || awayAbbrev}</div>
              <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-accent-blue mt-1.5">View Team &rarr;</div>
            </Link>
            <Link
              href={`/team/${homeAbbrev}`}
              className="group rounded-[20px] border border-dark-border/60 bg-dark-surface/60 p-5 hover:bg-dark-surface hover:border-accent-blue/40 transition-all text-center"
            >
              <TeamLogo team={homeAbbrev} logo={game?.homeTeam.logo} size={48} color={homeColor} className="mx-auto mb-3" />
              <div className="text-[15px] font-heading font-black text-text-platinum group-hover:text-white transition-colors">{matchup?.homeStanding?.teamName || homeAbbrev}</div>
              <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-accent-blue mt-1.5">View Team &rarr;</div>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
