import { getNBASchedule, getRecentNBAGames } from "@/lib/nba-api";
import { getNBAOdds } from "@/lib/nba-odds";
import { buildNBAStatsPropFeed } from "@/lib/nba-stats-engine";
import { buildNBATeamTrends } from "@/lib/nba-team-trends";

export async function getNBADashboardData() {
  // Fetch schedule + recent games + odds in parallel
  const [schedule, recentGames, odds] = await Promise.all([
    getNBASchedule(),
    getRecentNBAGames(10),
    getNBAOdds(),
  ]);

  // Pass recentGames in so stats engine doesn't re-fetch
  const [props, teamTrends] = await Promise.all([
    buildNBAStatsPropFeed(schedule, { maxGames: 3, maxPlayers: 5, recentGames }),
    buildNBATeamTrends(schedule),
  ]);

  return {
    schedule,
    props,
    teamTrends,
    odds,
    meta: {
      league: "NBA",
      oddsConnected: odds.length > 0,
      gamesCount: schedule.length,
      propsCount: props.length,
      statsSource: "espn",
    },
  };
}

export async function getNBATrendData() {
  const [schedule, recentGames, odds] = await Promise.all([
    getNBASchedule(),
    getRecentNBAGames(10),
    getNBAOdds(),
  ]);

  const [props, teamTrends] = await Promise.all([
    buildNBAStatsPropFeed(schedule, { maxGames: 2, maxPlayers: 4, recentGames }),
    buildNBATeamTrends(schedule),
  ]);

  return {
    props,
    teamTrends,
    meta: {
      league: "NBA",
      oddsConnected: odds.length > 0,
      gamesCount: schedule.length,
      propsCount: props.length,
      statsSource: "espn",
    },
  };
}
