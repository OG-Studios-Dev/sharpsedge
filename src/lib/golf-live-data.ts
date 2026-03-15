import { getGolfOdds, findGolfOutright } from "@/lib/golf-odds";
import { buildGolfPlayerInsights } from "@/lib/golf-stats-engine";
import { getPGALeaderboard, getPGASchedule, getPlayerTournamentHistory } from "@/lib/golf-api";
import { GolfDashboardData } from "@/lib/types";

const INSIGHT_PLAYER_LIMIT = 12;

export async function getGolfDashboardData(): Promise<GolfDashboardData> {
  const [leaderboard, schedule, odds] = await Promise.all([
    getPGALeaderboard(),
    getPGASchedule(),
    getGolfOdds(),
  ]);

  const candidatePlayers = (leaderboard?.players ?? []).slice(0, INSIGHT_PLAYER_LIMIT);
  const historyEntries = await Promise.all(
    candidatePlayers.map(async (player) => [player.id, await getPlayerTournamentHistory(player.id)] as const),
  );

  const historyByPlayer = Object.fromEntries(historyEntries);
  const playerInsights = buildGolfPlayerInsights(leaderboard, historyByPlayer)
    .map((player) => {
      const outright = findGolfOutright(odds, player.name);
      return {
        ...player,
        outrightOdds: outright?.odds ?? null,
        outrightBook: outright?.book ?? null,
      };
    })
    .slice(0, 10);

  return {
    leaderboard,
    schedule,
    playerInsights,
    odds,
    meta: {
      league: "PGA",
      oddsConnected: Boolean(odds && (odds.outrights.length > 0 || odds.h2h.length > 0)),
      scheduleCount: schedule.length,
      playersCount: leaderboard?.players.length ?? 0,
      tournamentStatus: leaderboard?.tournament.status ?? "none",
    },
  };
}
