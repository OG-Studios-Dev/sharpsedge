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
    // Stop after first bookmaker with data
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

  // Determine winner for final games
  const homeWon = isFinal && game.homeScore !== null && game.awayScore !== null && game.homeScore > game.awayScore;
  const awayWon = isFinal && game.homeScore !== null && game.awayScore !== null && game.awayScore > game.homeScore;

  return (
    <Link href={`/nba/matchup/${game.id}`} className="block">
      <div
        className="relative rounded-2xl border border-dark-border overflow-hidden hover:border-gray-500 transition-colors"
        style={{
          background: `linear-gradient(135deg, ${awayColor}1e 0%, #161923 40%, #161923 60%, ${homeColor}1e 100%)`,
        }}
      >
        {/* Top: Status */}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-accent-red uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
              LIVE
            </span>
          ) : isFinal ? (
            <span className="text-[10px] text-gray-500 font-medium px-2 py-0.5 rounded-full bg-dark-bg/60 border border-dark-border/50">
              Final
            </span>
          ) : (
            <span className="text-[10px] text-gray-400 font-medium px-2 py-0.5 rounded-full bg-dark-bg/60 border border-dark-border/50">
              {game.status}
            </span>
          )}
          <span className="text-[10px] text-gray-600">{game.date}</span>
        </div>

        {/* Center: Scoreboard */}
        <div className="px-3 py-3">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
            {/* Away Team */}
            <div className="flex flex-col items-center gap-1.5 text-center">
              <TeamLogo team={awayAbbrev} size={32} color={awayColor} />
              <span className={`text-sm font-bold ${awayWon ? "text-white" : "text-gray-400"}`}>
                {awayAbbrev}
                {awayWon && <span className="ml-1 text-accent-green text-[10px]">◄</span>}
              </span>
              {(isLive || isFinal) && game.awayScore !== null && (
                <span className={`text-2xl font-black tabular-nums ${awayWon ? "text-white" : "text-gray-300"}`}>
                  {game.awayScore}
                </span>
              )}
            </div>

            {/* Middle: Separator */}
            <div className="flex flex-col items-center gap-1 px-1">
              {isScheduled ? (
                <span className="text-gray-600 text-sm font-light">at</span>
              ) : (
                <span className="text-gray-600 text-xs">–</span>
              )}
              {isLive && (
                <span className="text-[9px] text-accent-red font-bold uppercase">Live</span>
              )}
            </div>

            {/* Home Team */}
            <div className="flex flex-col items-center gap-1.5 text-center">
              <TeamLogo team={homeAbbrev} size={32} color={homeColor} />
              <span className={`text-sm font-bold ${homeWon ? "text-white" : "text-gray-400"}`}>
                {homeWon && <span className="mr-1 text-accent-green text-[10px]">►</span>}
                {homeAbbrev}
              </span>
              {(isLive || isFinal) && game.homeScore !== null && (
                <span className={`text-2xl font-black tabular-nums ${homeWon ? "text-white" : "text-gray-300"}`}>
                  {game.homeScore}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Win Probability */}
        {isScheduled && homeProb !== null && awayProb !== null && (
          <div className="px-3 pb-2">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Win prob</p>
                <p className="text-xs font-bold text-white">{awayProb}%</p>
                <p className="text-[9px] text-gray-600">{awayDecimal}x</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Win prob</p>
                <p className="text-xs font-bold text-white">{homeProb}%</p>
                <p className="text-[9px] text-gray-600">{homeDecimal}x</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer: Spread + O/U */}
        {isScheduled && (homeSpread !== null || total !== null) && (
          <div className="px-3 pb-3">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {homeSpread !== null && (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-dark-bg/70 border border-dark-border/60 text-gray-400">
                  {homeAbbrev} {homeSpread > 0 ? "+" : ""}{homeSpread}
                </span>
              )}
              {total !== null && (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-dark-bg/70 border border-dark-border/60 text-gray-400">
                  O/U {total}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
