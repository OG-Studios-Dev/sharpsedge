"use client";

import TeamLogo from "./TeamLogo";
import type { MLBGame } from "@/lib/types";
import { MLB_TEAM_COLORS } from "@/lib/mlb-api";

function formatOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPitcher(name?: string, era?: number | null) {
  if (!name) return "TBD";
  if (era == null || !Number.isFinite(era)) return name;
  return `${name} • ${era.toFixed(2)} ERA`;
}

export default function MLBGameCard({ game }: { game: MLBGame }) {
  const awayAbbrev = game.awayTeam.abbreviation;
  const homeAbbrev = game.homeTeam.abbreviation;
  const awayColor = MLB_TEAM_COLORS[awayAbbrev] || "#334155";
  const homeColor = MLB_TEAM_COLORS[homeAbbrev] || "#334155";
  const isLive = game.status === "Live";
  const isFinal = game.status === "Final";
  const isScheduled = !isLive && !isFinal;
  const homeWon = isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWon = isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0);

  return (
    <div
      className="relative rounded-2xl border border-dark-border overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${awayColor}1e 0%, #161923 42%, #161923 58%, ${homeColor}1e 100%)`,
      }}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        {isLive ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-accent-red uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
            {game.inning || "Live"}
          </span>
        ) : isFinal ? (
          <span className="rounded-full border border-dark-border/50 bg-dark-bg/60 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            Final
          </span>
        ) : (
          <span className="rounded-full border border-dark-border/50 bg-dark-bg/60 px-2 py-0.5 text-[10px] font-medium text-gray-400">
            {game.status}
          </span>
        )}
        <span className="text-[10px] text-gray-600">{game.date}</span>
      </div>

      <div className="px-3 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <TeamLogo team={awayAbbrev} logo={game.awayTeam.logo} size={34} color={awayColor} />
            <span className={`text-sm font-bold ${awayWon ? "text-white" : "text-gray-300"}`}>
              {awayAbbrev}
            </span>
            {(isLive || isFinal) && game.awayScore !== null && (
              <span className={`text-2xl font-black tabular-nums ${awayWon ? "text-white" : "text-gray-300"}`}>
                {game.awayScore}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-xs text-gray-600">{isScheduled ? "at" : "vs"}</span>
            {isLive && <span className="text-[9px] font-bold uppercase text-accent-red">{game.statusDetail}</span>}
          </div>

          <div className="flex flex-col items-center gap-1.5 text-center">
            <TeamLogo team={homeAbbrev} logo={game.homeTeam.logo} size={34} color={homeColor} />
            <span className={`text-sm font-bold ${homeWon ? "text-white" : "text-gray-300"}`}>
              {homeAbbrev}
            </span>
            {(isLive || isFinal) && game.homeScore !== null && (
              <span className={`text-2xl font-black tabular-nums ${homeWon ? "text-white" : "text-gray-300"}`}>
                {game.homeScore}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-1 rounded-xl border border-dark-border/40 bg-dark-bg/40 p-2.5">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-gray-500">{awayAbbrev} SP</span>
            <span className="truncate text-right text-gray-300">
              {formatPitcher(game.awayTeam.probablePitcher?.name, game.awayTeam.probablePitcher?.era)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-gray-500">{homeAbbrev} SP</span>
            <span className="truncate text-right text-gray-300">
              {formatPitcher(game.homeTeam.probablePitcher?.name, game.homeTeam.probablePitcher?.era)}
            </span>
          </div>
        </div>
      </div>

      {isScheduled && (
        <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-3">
          {game.bestMoneyline?.away?.odds != null && (
            <span className="rounded-full border border-dark-border/60 bg-dark-bg/70 px-2.5 py-1 text-[10px] text-gray-300">
              {awayAbbrev} ML {formatOdds(game.bestMoneyline.away.odds)}
            </span>
          )}
          {game.bestMoneyline?.home?.odds != null && (
            <span className="rounded-full border border-dark-border/60 bg-dark-bg/70 px-2.5 py-1 text-[10px] text-gray-300">
              {homeAbbrev} ML {formatOdds(game.bestMoneyline.home.odds)}
            </span>
          )}
          {game.bestRunLine?.home?.line != null && (
            <span className="rounded-full border border-dark-border/60 bg-dark-bg/70 px-2.5 py-1 text-[10px] text-gray-300">
              RL {homeAbbrev} {game.bestRunLine.home.line > 0 ? "+" : ""}{game.bestRunLine.home.line}
            </span>
          )}
          {game.bestTotal?.line != null && (
            <span className="rounded-full border border-dark-border/60 bg-dark-bg/70 px-2.5 py-1 text-[10px] text-gray-300">
              O/U {game.bestTotal.line}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
