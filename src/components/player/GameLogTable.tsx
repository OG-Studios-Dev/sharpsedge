"use client";

import TeamLogo from "@/components/TeamLogo";
import { PlayerTrendGame, SupportedTrendLeague, getTrendGameStatValue } from "@/lib/player-trend";
import { didResearchStatHit } from "@/lib/player-research";

export type GameLogTableTab = "h2h" | "l5" | "l10" | "l20" | "season";

type GameLogTableProps = {
  games: PlayerTrendGame[];
  league: SupportedTrendLeague;
  statKey: string;
  line: number;
  direction: "Over" | "Under";
  activeTab: GameLogTableTab;
  onTabChange: (nextTab: GameLogTableTab) => void;
};

function formatDate(value: string) {
  if (!value) return "TBD";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatResult(game: PlayerTrendGame) {
  if (!game.result) return game.score || "Final";
  return `${game.result} ${game.score}`;
}

function getColumns(league: SupportedTrendLeague, statKey: string) {
  if (league === "NBA") {
    return [
      { label: "PTS", value: (game: PlayerTrendGame) => game.points ?? 0 },
      { label: "REB", value: (game: PlayerTrendGame) => game.rebounds ?? 0 },
      { label: "AST", value: (game: PlayerTrendGame) => game.assists ?? 0 },
      { label: "3PM", value: (game: PlayerTrendGame) => game.threePointersMade ?? 0 },
    ];
  }
  if (league === "NHL") {
    return [
      { label: "G", value: (game: PlayerTrendGame) => game.goals ?? 0 },
      { label: "A", value: (game: PlayerTrendGame) => game.assists ?? 0 },
      { label: "PTS", value: (game: PlayerTrendGame) => game.points ?? 0 },
      { label: "SOG", value: (game: PlayerTrendGame) => game.shots ?? 0 },
    ];
  }

  return [
    { label: statKey.replace(/[^A-Za-z0-9+]/g, "").toUpperCase().slice(0, 6) || "STAT", value: (game: PlayerTrendGame) => getTrendGameStatValue(game, statKey, league) },
  ];
}

const TABS: Array<{ key: GameLogTableTab; label: string }> = [
  { key: "h2h", label: "H2H" },
  { key: "l5", label: "L5" },
  { key: "l10", label: "L10" },
  { key: "l20", label: "L20" },
  { key: "season", label: "Season" },
];

export default function GameLogTable({
  games,
  league,
  statKey,
  line,
  direction,
  activeTab,
  onTabChange,
}: GameLogTableProps) {
  const columns = getColumns(league, statKey);

  return (
    <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="border-b border-dark-border/80 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Game Log</p>
            <p className="mt-1 text-sm text-gray-300">Every row grades against the current prop.</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : "border-dark-border bg-dark-bg/70 text-gray-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-500">No games match the current table split.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-dark-bg/70 text-[11px] uppercase tracking-[0.16em] text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Hit</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Opponent</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Min</th>
                {columns.map((column) => (
                  <th key={column.label} className="px-4 py-3 font-medium text-right">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border/60">
              {games.map((game) => {
                const value = getTrendGameStatValue(game, statKey, league);
                const hit = didResearchStatHit(value, line, direction);
                return (
                  <tr key={`${game.gameId}-${game.date}`} className={hit ? "bg-emerald-500/8" : "bg-red-500/6"}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
                        hit
                          ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-100"
                          : "border-red-500/30 bg-red-500/12 text-red-100"
                      }`}>
                        {hit ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{formatDate(game.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TeamLogo team={game.opponentAbbrev} size={24} sport={league} />
                        <span className="font-medium text-white">{game.opponentAbbrev}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{formatResult(game)}</td>
                    <td className="px-4 py-3 text-gray-300">{game.minutes || "—"}</td>
                    {columns.map((column) => (
                      <td key={`${game.gameId}-${column.label}`} className="px-4 py-3 text-right font-semibold text-white">
                        {column.value(game)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
