import { getGolfOdds } from "@/lib/golf-odds";
import { buildGolfPredictionBoard, buildGolfTournamentPicks } from "@/lib/golf-stats-engine";
import { getPGALeaderboard, getPGASchedule, getPlayerTournamentHistory } from "@/lib/golf-api";
import { getDateKey } from "@/lib/date-utils";
import { AIPick, GolfDashboardData, GolfLeaderboard, GolfPredictionBoard } from "@/lib/types";

async function loadHistoryByPlayer(leaderboard: GolfLeaderboard | null) {
  const players = leaderboard?.players ?? [];
  const historyEntries = await Promise.all(
    players.map(async (player) => [player.id, await getPlayerTournamentHistory(player.id)] as const),
  );

  return Object.fromEntries(historyEntries);
}

export async function getGolfPredictionData(
  leaderboard?: GolfLeaderboard | null,
  oddsOverride?: Awaited<ReturnType<typeof getGolfOdds>> | null,
): Promise<GolfPredictionBoard> {
  const [resolvedLeaderboard, resolvedOdds] = await Promise.all([
    typeof leaderboard === "undefined" ? getPGALeaderboard() : Promise.resolve(leaderboard),
    typeof oddsOverride === "undefined" ? getGolfOdds() : Promise.resolve(oddsOverride),
  ]);

  const historyByPlayer = await loadHistoryByPlayer(resolvedLeaderboard);
  return buildGolfPredictionBoard(resolvedLeaderboard, historyByPlayer, resolvedOdds);
}

export async function getGolfTournamentPicks(date = getDateKey()): Promise<AIPick[]> {
  const predictions = await getGolfPredictionData();
  return buildGolfTournamentPicks(predictions, date);
}

export async function getGolfDashboardData(): Promise<GolfDashboardData> {
  const [leaderboard, schedule, odds] = await Promise.all([
    getPGALeaderboard(),
    getPGASchedule(),
    getGolfOdds(),
  ]);

  const predictions = await getGolfPredictionData(leaderboard, odds);
  const playerInsights = predictions.players.slice(0, 10);

  return {
    leaderboard,
    schedule,
    playerInsights,
    odds,
    predictions,
    meta: {
      league: "PGA",
      oddsConnected: Boolean(odds && (odds.outrights.length > 0 || odds.h2h.length > 0)),
      scheduleCount: schedule.length,
      playersCount: leaderboard?.players.length ?? 0,
      tournamentStatus: leaderboard?.tournament.status ?? "none",
    },
  };
}
