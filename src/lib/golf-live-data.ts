import { getGolfOdds } from "@/lib/golf-odds";
import { getDGCache } from "@/lib/datagolf-cache";
import { buildGolfPredictionBoard, buildGolfTournamentPicks } from "@/lib/golf-stats-engine";
import { getPGALeaderboard, getPGASchedule, getPlayerTournamentHistory } from "@/lib/golf-api";
import { getDateKey } from "@/lib/date-utils";
import { AIPick, GolfDashboardData, GolfLeaderboard, GolfPredictionBoard, GolfTournament } from "@/lib/types";

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

  const [historyByPlayer, dgCache] = await Promise.all([
    loadHistoryByPlayer(resolvedLeaderboard),
    getDGCache(),
  ]);

  return buildGolfPredictionBoard(resolvedLeaderboard, historyByPlayer, resolvedOdds, dgCache);
}

/**
 * Derive the storage date key for a tournament.
 * Uses the tournament startDate if available, otherwise falls back to today.
 * This ensures picks are stored once per tournament, not per day.
 */
export function getTournamentDateKey(tournament: GolfTournament | null | undefined): string {
  if (tournament?.startDate) {
    // startDate is typically "YYYY-MM-DD" already
    const parsed = tournament.startDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  }
  return getDateKey();
}

export async function getGolfTournamentPicks(date?: string): Promise<{ picks: AIPick[]; tournamentDateKey: string }> {
  const predictions = await getGolfPredictionData();
  const tournamentDateKey = date ?? getTournamentDateKey(predictions.tournament);
  const picks = buildGolfTournamentPicks(predictions, tournamentDateKey);
  return { picks, tournamentDateKey };
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
