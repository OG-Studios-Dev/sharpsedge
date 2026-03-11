import { getNBASchedule } from "@/lib/nba-api";
import { getNBAOdds } from "@/lib/nba-odds";
import { buildNBAStatsPropFeed } from "@/lib/nba-stats-engine";
import { buildNBATeamTrends } from "@/lib/nba-team-trends";

export async function getNBADashboardData() {
  const [schedule, odds] = await Promise.all([
    getNBASchedule(),
    getNBAOdds(),
  ]);

  const [props, teamTrends] = await Promise.all([
    buildNBAStatsPropFeed(schedule),
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
      liveOnly: true,
      statsSource: "live-nba",
    },
  };
}

export async function getNBATrendData() {
  const [schedule, odds] = await Promise.all([
    getNBASchedule(),
    getNBAOdds(),
  ]);

  const [props, teamTrends] = await Promise.all([
    buildNBAStatsPropFeed(schedule, { maxGames: 3 }),
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
      liveOnly: false,
      statsSource: "live-nba",
    },
  };
}
