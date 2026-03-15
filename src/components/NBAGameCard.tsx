"use client";

import Link from "next/link";
import TeamLogo from "./TeamLogo";
import { NBA_TEAM_COLORS } from "@/lib/nba-api";
import { OddsEvent } from "@/lib/types";

export type NBAGameCardGame = {
  id: string;
  date: string;
  status: string;
  homeTeam: { id: string; abbreviation: string; fullName: string };
  awayTeam: { id: string; abbreviation: string; fullName: string };
  homeScore: number | null;
  awayScore: number | null;
};

type NBAGameCardProps = {
  game: NBAGameCardGame;
  oddsEvent?: OddsEvent;
};

/** Convert American odds to win probability (0-100) */
function oddsToWinProb(odds: number): number {
  if (odds < 0) return Math.round((Math.abs(odds) / (Math.abs(odds) + 100)) * 100);
  return Math.round((100 / (odds + 100)) * 100);
}

/** Convert American odds to decimal odds */
function oddsToDecimal(odds: number): string {
  if (odds < 0) return (100 / Math.abs(odds) + 1).toFixed(2);
  return (odds / 100 + 1).toFixed(2);
}

function extractOdds(oddsEvent: OddsEvent | undefined, homeTeam: string, awayTeam: string) {
  if (!oddsEvent) return { homeML: null, awayML: null, homeSpread: null, awaySpread: null, total: null };

  let homeML: number | null = null;
  let awayML: number | null = null;
  let homeSpread: number | null = null;
  let awaySpread: number | null = null;
  let total: number | null = null;

  for (const bk of oddsEvent.bookmakers) {
    for (const market of bk.markets) {
      if (market.key === "h2h") {
        for (const o of market.outcomes) {
          const name = o.name.toLowerCase();
          if (name.includes(homeTeam.toLowerCase()) || name.includes(oddsEvent.home_team.toLowerCase())) {
            homeML = homeML ?? o.price;
          } else {
            awayML = awayML ?? o.price;
          }
        }
      }
      if (market.key === "spreads") {
        for (const o of market.outcomes) {
          const name = o.name.toLowerCase();
          if (name.includes(homeTeam.toLowerCase()) || name.includes(oddsEvent.home_team.toLowerCase())) {
            homeSpread = homeSpread ?? (o.point ?? null);
          } else {
            awaySpread = awaySpread ?? (o.point ?? null);
          }
        }
      }
      if (market.key === "totals") {
        for (const o of market.outcomes) {
          if (o.name === "Over" && o.point !== undefined) {
            total = total ?? o.point;
          }
        }
      }
    }
    if (homeML !== null || awayML !== null) break;
  }

  return { homeML, awayML, homeSpread, awaySpread, total };
}

export default function NBAGameCard({ game, oddsEvent }: NBAGameCardProps) {
  const awayAbbrev = game.awayTeam.abbreviation;
  const homeAbbrev = game.homeTeam.abbreviation;
  const awayColor = NBA_TEAM_COLORS[awayAbbrev] || "#334155";
  const homeColor = NBA_TEAM_COLORS[homeAbbrev] || "#334155";

  const isLive = game.status === "Live";
  const isFinal = game.status === "Final";
  const isScheduled = !isLive && !isFinal;

  const { homeML, awayML, homeSpread, awaySpread, total } = extractOdds(
    oddsEvent,
    game.homeTeam.fullName,
    game.awayTeam.fullName
  );

  const homeProb = homeML !== null ? oddsToWinProb(homeML) : null;
  const awayProb = awayML !== null ? oddsToWinProb(awayML) : null;
  const homeDecimal = homeML !== null ? oddsToDecimal(homeML) : null;
  const awayDecimal = awayML !== null ? oddsToDecimal(awayML) : null;

  const homeWon = isFinal && game.homeScore !== null && game.awayScore !== null && game.homeScore > game.awayScore;
  const awayWon = isFinal && game.homeScore !== null && game.awayScore !== null && game.awayScore > game.homeScore;

  return (
    <Link href={`/nba/matchup/${game.id}`} className="block group h-full">
      <div
        className="relative flex flex-col h-full rounded-2xl border border-dark-border/80 bg-gradient-to-br from-dark-surface/80 to-dark-bg hover:border-accent-blue/50 hover:shadow-[0_8px_30px_-15px_rgba(74,158,255,0.15)] transition-all duration-300 overflow-hidden"
      >
        {isLive && (
          <div className="absolute top-0 right-0 left-0 h-0.5 bg-gradient-to-r from-transparent via-accent-green to-transparent opacity-80" />
        )}
        
        {/* Top: Status */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-dark-border/30">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-accent-green uppercase font-mono tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              LIVE
            </span>
          ) : isFinal ? (
            <span className="text-[10px] text-text-platinum/50 font-bold uppercase font-mono tracking-widest">
              Final
            </span>
          ) : (
            <span className="text-[10px] text-text-platinum/50 font-bold uppercase font-mono tracking-widest">
              {game.status}
            </span>
          )}
          <span className="text-[10px] text-text-platinum/30 font-mono">{game.date}</span>
        </div>

        {/* Center: Scoreboard */}
        <div className="flex-1 px-5 py-5 flex items-center">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 w-full items-center">
            {/* Away Team */}
            <div className="flex flex-col items-center gap-2 text-center">
              <TeamLogo team={awayAbbrev} size={36} color={awayColor} />
              <div className="flex flex-col items-center">
                <span className={`text-[13px] font-heading font-bold ${awayWon ? "text-text-platinum drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" : "text-text-platinum/70 group-hover:text-white transition-colors"}`}>
                  {awayAbbrev}
                  {awayWon && <span className="ml-1 text-accent-green text-[10px]">◄</span>}
                </span>
              </div>
              {(isLive || isFinal) && game.awayScore !== null && (
                <span className={`text-[28px] font-mono font-black tabular-nums leading-none mt-1 ${awayWon ? "text-text-platinum text-shadow-sm" : "text-text-platinum/50"}`}>
                  {game.awayScore}
                </span>
              )}
            </div>

            {/* Middle: Separator */}
            <div className="flex flex-col items-center gap-1 px-1">
              {isScheduled ? (
                 <div className="text-[10px] text-text-platinum/30 font-mono uppercase tracking-widest">VS</div>
              ) : (
                 <div className="text-[10px] text-text-platinum/30 font-mono uppercase tracking-widest">VS</div>
              )}
            </div>

            {/* Home Team */}
            <div className="flex flex-col items-center gap-2 text-center">
              <TeamLogo team={homeAbbrev} size={36} color={homeColor} />
              <div className="flex flex-col items-center">
                <span className={`text-[13px] font-heading font-bold ${homeWon ? "text-text-platinum drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" : "text-text-platinum/70 group-hover:text-white transition-colors"}`}>
                  {homeWon && <span className="mr-1 text-accent-green text-[10px]">►</span>}
                  {homeAbbrev}
                </span>
              </div>
              {(isLive || isFinal) && game.homeScore !== null && (
                <span className={`text-[28px] font-mono font-black tabular-nums leading-none mt-1 ${homeWon ? "text-text-platinum text-shadow-sm" : "text-text-platinum/50"}`}>
                  {game.homeScore}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Win Probability & Spread/Total */}
        {isScheduled && (homeProb !== null || homeSpread !== null) && (
          <div className="px-4 pb-4 mt-auto">
            {homeProb !== null && awayProb !== null && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-dark-border/40">
                <div className="flex flex-col text-center">
                  <span className="text-[9px] text-text-platinum/40 uppercase font-mono tracking-widest mb-1 group-hover:text-text-platinum/60 transition-colors">Away Win Prob</span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-sm font-mono font-bold text-text-platinum">{awayProb}%</span>
                    <span className="text-[9px] text-text-platinum/40 font-mono">({awayDecimal}x)</span>
                  </div>
                </div>
                <div className="flex flex-col text-center border-l border-dark-border/50">
                  <span className="text-[9px] text-text-platinum/40 uppercase font-mono tracking-widest mb-1 group-hover:text-text-platinum/60 transition-colors">Home Win Prob</span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-sm font-mono font-bold text-text-platinum">{homeProb}%</span>
                    <span className="text-[9px] text-text-platinum/40 font-mono">({homeDecimal}x)</span>
                  </div>
                </div>
              </div>
            )}
            
            {(homeSpread !== null || total !== null) && (
               <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                 {homeSpread !== null && (
                   <span className="text-[10px] px-2 py-0.5 rounded border border-dark-border bg-dark-bg/60 text-text-platinum/60 font-mono font-bold tracking-tight">
                     {homeAbbrev} {homeSpread > 0 ? "+" : ""}{homeSpread}
                   </span>
                 )}
                 {total !== null && (
                   <span className="text-[10px] px-2 py-0.5 rounded border border-dark-border bg-dark-bg/60 text-text-platinum/60 font-mono font-bold tracking-tight">
                     O/U {total}
                   </span>
                 )}
               </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
