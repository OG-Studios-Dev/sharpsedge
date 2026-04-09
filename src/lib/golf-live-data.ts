import { getGolfOdds, getBovadaTopFinishOdds } from "@/lib/golf-odds";
import { getDGCache } from "@/lib/datagolf-cache";
import { buildGolfPredictionBoard, buildGolfTournamentPicks, buildBDLSeasonStatsMap, buildBDLFuturesMap } from "@/lib/golf-stats-engine";
import { getPGALeaderboard, getPGASchedule, getPlayerTournamentHistory } from "@/lib/golf-api";
import { getDateKey } from "@/lib/date-utils";
import { AIPick, GolfDashboardData, GolfLeaderboard, GolfPredictionBoard, GolfTournament } from "@/lib/types";
import { getBDLSeasonStats, getBDLFutures, getBDLTeeTimes, getBDLCurrentTournament, type BDLTeeTime } from "@/lib/golf/bdl-pga";

async function loadHistoryByPlayer(leaderboard: GolfLeaderboard | null) {
  const players = leaderboard?.players ?? [];
  const historyEntries = await Promise.all(
    players
      .filter((player) => !player.id.startsWith("dg-field:"))
      .map(async (player) => [player.id, await getPlayerTournamentHistory(player.id)] as const),
  );

  return Object.fromEntries(historyEntries);
}

function hydrateUpcomingFieldFromDG(
  leaderboard: GolfLeaderboard | null,
  dgCache: Awaited<ReturnType<typeof getDGCache>>,
): GolfLeaderboard | null {
  if (!leaderboard) return leaderboard;
  if ((leaderboard.players?.length ?? 0) > 0) return leaderboard;
  if (leaderboard.tournament.status !== "upcoming") return leaderboard;

  const field = dgCache?.data?.field ?? [];
  if (!field.length) return leaderboard;

  return {
    ...leaderboard,
    players: field.map((entry, index) => ({
      id: `dg-field:${index}:${entry.name}`,
      name: entry.name,
      position: "—",
      score: "E",
      todayScore: "E",
      thru: "—",
      teeTime: "",
      status: "scheduled",
      roundScores: [],
    })),
    lastUpdated: dgCache?.lastScrape ?? leaderboard.lastUpdated ?? null,
  };
}

export async function getGolfPredictionData(
  leaderboard?: GolfLeaderboard | null,
  oddsOverride?: Awaited<ReturnType<typeof getGolfOdds>> | null,
): Promise<GolfPredictionBoard> {
  const [resolvedLeaderboard, resolvedOdds] = await Promise.all([
    typeof leaderboard === "undefined" ? getPGALeaderboard() : Promise.resolve(leaderboard),
    typeof oddsOverride === "undefined" ? getGolfOdds() : Promise.resolve(oddsOverride),
  ]);

  const [dgCache, bdlSeasonStatsRaw, bdlCurrentTournament] = await Promise.all([
    getDGCache(),
    getBDLSeasonStats(2025),
    getBDLCurrentTournament(),
  ]);

  const hydratedLeaderboard = hydrateUpcomingFieldFromDG(resolvedLeaderboard, dgCache);
  const historyByPlayer = await loadHistoryByPlayer(hydratedLeaderboard);

  // Fetch BDL futures for the current tournament (non-blocking)
  const bdlFuturesRaw = bdlCurrentTournament
    ? await getBDLFutures(bdlCurrentTournament.id).catch(() => [])
    : [];

  const bdlSeasonStatsMap = buildBDLSeasonStatsMap(bdlSeasonStatsRaw);
  const bdlFuturesMap = buildBDLFuturesMap(bdlFuturesRaw);

  return buildGolfPredictionBoard(hydratedLeaderboard, historyByPlayer, resolvedOdds, dgCache, bdlSeasonStatsMap, bdlFuturesMap);
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

  // Attempt to load real top-finish odds (Bovada snapshots or manual DK seed fallback).
  // When available, picks will use real scraped lines instead of proxy estimates.
  const bovadaTopFinishOdds = await getBovadaTopFinishOdds().catch(() => null);

  const picks = buildGolfTournamentPicks(predictions, tournamentDateKey, bovadaTopFinishOdds);
  return { picks, tournamentDateKey };
}

export async function getGolfDashboardData(): Promise<GolfDashboardData> {
  const [leaderboard, schedule, odds, bdlCurrentTournament] = await Promise.all([
    getPGALeaderboard(),
    getPGASchedule(),
    getGolfOdds(),
    getBDLCurrentTournament(),
  ]);

  // Fetch BDL tee times for current/upcoming round (non-blocking)
  let teeTimes: BDLTeeTime[] = [];
  if (bdlCurrentTournament) {
    teeTimes = await getBDLTeeTimes(bdlCurrentTournament.id).catch(() => []);
  }

  const predictions = await getGolfPredictionData(leaderboard, odds);
  const playerInsights = predictions.players.slice(0, 10);

  return {
    leaderboard,
    schedule,
    playerInsights,
    odds,
    predictions,
    teeTimes,
    meta: {
      league: "PGA",
      oddsConnected: Boolean(odds && (odds.outrights.length > 0 || odds.h2h.length > 0)),
      scheduleCount: schedule.length,
      playersCount: leaderboard?.players.length ?? 0,
      tournamentStatus: leaderboard?.tournament.status ?? "none",
    },
  };
}
