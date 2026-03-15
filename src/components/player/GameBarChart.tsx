"use client";

import { PlayerTrendGame, SupportedTrendLeague, getTrendGameStatValue } from "@/lib/player-trend";
import { didResearchStatHit } from "@/lib/player-research";

type GameBarChartProps = {
  games: PlayerTrendGame[];
  league: SupportedTrendLeague;
  statKey: string;
  line: number;
  direction: "Over" | "Under";
};

function formatDateLabel(value: string) {
  if (!value) return "TBD";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function GameBarChart({ games, league, statKey, line, direction }: GameBarChartProps) {
  const chartGames = games.slice(0, 20);
  const maxValue = Math.max(line, ...chartGames.map((game) => getTrendGameStatValue(game, statKey, league)), 1);
  const lineOffset = `${Math.min((line / maxValue) * 100, 100)}%`;
  const columnWidth = chartGames.length > 12 ? 58 : 64;

  return (
    <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Game Log Visualization</p>
          <p className="mt-1 text-sm text-gray-300">Last {chartGames.length} games versus the current line.</p>
        </div>
        <div className="rounded-full border border-dark-border bg-dark-bg/70 px-3 py-1 text-xs font-semibold text-gray-300">
          {direction} {line.toFixed(1)}
        </div>
      </div>

      {chartGames.length === 0 ? (
        <div className="mt-4 rounded-[24px] border border-dark-border bg-dark-bg/70 px-4 py-10 text-center text-sm text-gray-500">
          No games match the current filter set.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto pb-1 scrollbar-hide">
          <div className="relative" style={{ minWidth: chartGames.length * columnWidth }}>
            <div
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-gray-500/80"
              style={{ bottom: lineOffset }}
            />
            <div className="grid h-[320px] items-end gap-3" style={{ gridTemplateColumns: `repeat(${chartGames.length}, minmax(0, 1fr))` }}>
              {chartGames.map((game) => {
                const value = getTrendGameStatValue(game, statKey, league);
                const hit = didResearchStatHit(value, line, direction);
                const height = `${Math.max((value / maxValue) * 100, 8)}%`;
                return (
                  <div key={`${game.gameId}-${game.date}`} className="flex flex-col items-center">
                    <div className="mb-2 text-xs font-semibold text-white">{value}</div>
                    <div className="relative flex h-[220px] w-full items-end justify-center rounded-[20px] bg-dark-bg/70 px-2 py-3">
                      <div
                        className={`w-full rounded-[16px] ${hit ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ height }}
                      />
                    </div>
                    <p className="mt-3 text-[11px] font-medium text-gray-300">{formatDateLabel(game.date)}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">{game.opponentAbbrev}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
