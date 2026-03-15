"use client";

import TeamLogo from "./TeamLogo";
import type { MLBGame } from "@/lib/types";
import { MLB_TEAM_COLORS } from "@/lib/mlb-api";

function formatOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export default function MLBGameCard({ game }: { game: MLBGame }) {
  const awayAbbrev = game.awayTeam.abbreviation;
  const homeAbbrev = game.homeTeam.abbreviation;
  const awayColor = MLB_TEAM_COLORS[awayAbbrev] || "#334155";
  const homeColor = MLB_TEAM_COLORS[homeAbbrev] || "#334155";
  const isLive = game.status === "Live";
  const isFinal = game.status === "Final";
  const homeWon = isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface/70 px-3 py-2.5">
      {/* Status row */}
      <div className="flex items-center justify-between mb-2">
        {isLive ? (
          <span className="flex items-center gap-1 text-[9px] font-bold text-accent-red uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
            {game.inning || "Live"}
          </span>
        ) : isFinal ? (
          <span className="text-[9px] font-medium text-gray-500">Final</span>
        ) : (
          <span className="text-[9px] font-medium text-gray-400">{game.status}</span>
        )}
        {game.bestTotal?.line != null && (
          <span className="text-[9px] text-gray-500">O/U {game.bestTotal.line}</span>
        )}
      </div>

      {/* Away team row */}
      <div className={`flex items-center gap-2 py-1 ${awayWon ? "opacity-100" : isFinal ? "opacity-60" : ""}`}>
        <TeamLogo team={awayAbbrev} logo={game.awayTeam.logo} size={20} color={awayColor} />
        <span className={`text-xs font-semibold flex-1 ${awayWon ? "text-white" : "text-gray-300"}`}>{awayAbbrev}</span>
        <span className="text-[9px] text-gray-500 truncate max-w-[80px]">{game.awayTeam.probablePitcher?.name || ""}</span>
        {(isLive || isFinal) && game.awayScore !== null && (
          <span className={`text-sm font-bold tabular-nums w-6 text-right ${awayWon ? "text-white" : "text-gray-400"}`}>{game.awayScore}</span>
        )}
        {!isLive && !isFinal && game.bestMoneyline?.away?.odds != null && (
          <span className="text-[10px] text-gray-400 w-12 text-right">{formatOdds(game.bestMoneyline.away.odds)}</span>
        )}
      </div>

      {/* Home team row */}
      <div className={`flex items-center gap-2 py-1 ${homeWon ? "opacity-100" : isFinal ? "opacity-60" : ""}`}>
        <TeamLogo team={homeAbbrev} logo={game.homeTeam.logo} size={20} color={homeColor} />
        <span className={`text-xs font-semibold flex-1 ${homeWon ? "text-white" : "text-gray-300"}`}>{homeAbbrev}</span>
        <span className="text-[9px] text-gray-500 truncate max-w-[80px]">{game.homeTeam.probablePitcher?.name || ""}</span>
        {(isLive || isFinal) && game.homeScore !== null && (
          <span className={`text-sm font-bold tabular-nums w-6 text-right ${homeWon ? "text-white" : "text-gray-400"}`}>{game.homeScore}</span>
        )}
        {!isLive && !isFinal && game.bestMoneyline?.home?.odds != null && (
          <span className="text-[10px] text-gray-400 w-12 text-right">{formatOdds(game.bestMoneyline.home.odds)}</span>
        )}
      </div>
    </div>
  );
}
