import { getScheduleDaysAhead } from "@/lib/date-utils";
import { getSoccerOdds, findSoccerOddsForMatch, getBestSoccerThreeWay, getBestSoccerTotal, getSoccerThreeWayBookOdds } from "@/lib/soccer-odds";
import { getRecentSoccerMatches, getSoccerSchedule, getSoccerStandings, type SoccerLeague, type SoccerMatch, type SoccerTeamStanding } from "@/lib/soccer-api";
import { buildSoccerMatchInsights, type SoccerMatchInsight } from "@/lib/soccer-stats-engine";
import { buildSoccerTeamTrends } from "@/lib/soccer-team-trends";
import type { OddsEvent, TeamTrend } from "@/lib/types";

export type SoccerDashboardData = {
  league: SoccerLeague;
  schedule: SoccerMatch[];
  standings: SoccerTeamStanding[];
  teamTrends: TeamTrend[];
  odds: OddsEvent[];
  matchInsights: SoccerMatchInsight[];
  meta: {
    oddsConnected: boolean;
    scheduleCount: number;
    standingsCount: number;
    trendCount: number;
  };
};

function attachOdds(matches: SoccerMatch[], odds: OddsEvent[]) {
  return matches.map((match) => {
    const event = findSoccerOddsForMatch(odds, match);
    if (!event) return match;

    return {
      ...match,
      oddsEventId: event.id,
      bestThreeWay: getBestSoccerThreeWay(event),
      threeWayBookOdds: getSoccerThreeWayBookOdds(event),
      bestTotal: getBestSoccerTotal(event),
    };
  });
}

export async function getSoccerDashboardData(league: SoccerLeague): Promise<SoccerDashboardData> {
  const [schedule, standings, recentMatches, odds] = await Promise.all([
    getSoccerSchedule(league, getScheduleDaysAhead() + 2),
    getSoccerStandings(league),
    getRecentSoccerMatches(league, 35),
    getSoccerOdds(league),
  ]);

  const scheduleWithOdds = attachOdds(schedule, odds);
  const matchInsights = buildSoccerMatchInsights(scheduleWithOdds, recentMatches, standings);
  const teamTrends = buildSoccerTeamTrends(scheduleWithOdds, recentMatches);

  return {
    league,
    schedule: scheduleWithOdds,
    standings,
    teamTrends,
    odds,
    matchInsights,
    meta: {
      oddsConnected: odds.length > 0,
      scheduleCount: scheduleWithOdds.length,
      standingsCount: standings.length,
      trendCount: teamTrends.length,
    },
  };
}
