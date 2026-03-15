import { getDateKey, getScheduleDaysAhead } from "@/lib/date-utils";
import { getBestOdds } from "@/lib/odds-api";
import {
  MLBGame,
  getCurrentMLBSeason,
  getMLBSchedule,
  getMLBScheduleRange,
  getRecentMLBGames,
} from "@/lib/mlb-api";
import { getBestSpreadForTeam, getBestTotalForEvent, getMLBOdds, findMLBOddsForGame } from "@/lib/mlb-odds";
import { buildMLBStatsPropFeed } from "@/lib/mlb-stats-engine";
import { buildMLBTeamTrends } from "@/lib/mlb-team-trends";

function attachLiveOddsToSchedule(games: MLBGame[], events: Awaited<ReturnType<typeof getMLBOdds>>) {
  return games.map((game) => {
    const event = findMLBOddsForGame(events, game.homeTeam.abbreviation, game.awayTeam.abbreviation);
    if (!event) return game;

    const homeOdds = getBestOdds(event, "h2h", event.home_team);
    const awayOdds = getBestOdds(event, "h2h", event.away_team);
    const homeRunLine = getBestSpreadForTeam(event, event.home_team);
    const awayRunLine = getBestSpreadForTeam(event, event.away_team);
    const total = getBestTotalForEvent(event);

    return {
      ...game,
      oddsEventId: event.id,
      bestMoneyline: {
        home: homeOdds,
        away: awayOdds,
      },
      bestRunLine: {
        home: homeRunLine,
        away: awayRunLine,
      },
      bestTotal: total,
    };
  });
}

async function getFallbackSlate() {
  const previousSeason = getCurrentMLBSeason() - 1;
  const fallbackGames = await getMLBScheduleRange(`${previousSeason}-09-01`, `${previousSeason}-11-15`);
  const completed = fallbackGames.filter((game) => game.status === "Final");
  if (!completed.length) {
    return {
      season: previousSeason,
      scheduleDate: null as string | null,
      slateGames: [] as MLBGame[],
      recentGames: [] as MLBGame[],
    };
  }

  const latestDate = [...completed].sort((a: MLBGame, b: MLBGame) => b.date.localeCompare(a.date))[0]?.date ?? null;
  if (!latestDate) {
    return {
      season: previousSeason,
      scheduleDate: null,
      slateGames: [] as MLBGame[],
      recentGames: completed,
    };
  }
  const slateGames = completed.filter((game) => game.date === latestDate);
  return {
    season: previousSeason,
    scheduleDate: latestDate,
    slateGames,
    recentGames: completed,
  };
}

async function getDashboardInputs() {
  const [schedule, recentGames, odds] = await Promise.all([
    getMLBSchedule(getScheduleDaysAhead()),
    getRecentMLBGames(21),
    getMLBOdds(),
  ]);

  const scheduleWithOdds = attachLiveOddsToSchedule(schedule, odds);
  if (scheduleWithOdds.length > 0) {
    return {
      season: getCurrentMLBSeason(),
      schedule: scheduleWithOdds,
      analysisGames: scheduleWithOdds,
      recentGames,
      odds,
      fallbackDate: null as string | null,
    };
  }

  const fallback = await getFallbackSlate();
  const fallbackSchedule = attachLiveOddsToSchedule(fallback.slateGames, odds);

  return {
    season: fallback.season,
    schedule: [] as MLBGame[],
    analysisGames: fallbackSchedule,
    recentGames: fallback.recentGames,
    odds,
    fallbackDate: fallback.scheduleDate,
  };
}

export async function getMLBDashboardData() {
  const { season, schedule, analysisGames, recentGames, odds, fallbackDate } = await getDashboardInputs();
  const analysisTargets = analysisGames.filter((game) => game.status !== "Final");
  const gamesForModels = analysisTargets.length > 0 ? analysisTargets : analysisGames;

  const [props, teamTrends] = await Promise.all([
    buildMLBStatsPropFeed(gamesForModels, { maxGames: 3, maxHitters: 4, recentGames, season }),
    buildMLBTeamTrends(gamesForModels, recentGames, season),
  ]);

  return {
    schedule,
    props,
    teamTrends,
    odds,
    meta: {
      league: "MLB",
      oddsConnected: odds.length > 0,
      gamesCount: gamesForModels.length,
      propsCount: props.length,
      scheduleCount: schedule.length,
      fallbackDate,
      statsSource: "mlb-stats-api",
      scheduleMessage: schedule.length === 0 ? "No games scheduled" : null,
    },
  };
}

export async function getMLBTrendData() {
  const { season, analysisGames, recentGames, odds, fallbackDate } = await getDashboardInputs();
  const [props, teamTrends] = await Promise.all([
    buildMLBStatsPropFeed(analysisGames, { maxGames: 3, maxHitters: 4, recentGames, season }),
    buildMLBTeamTrends(analysisGames, recentGames, season),
  ]);

  return {
    props,
    teamTrends,
    meta: {
      league: "MLB",
      oddsConnected: odds.length > 0,
      gamesCount: analysisGames.length,
      propsCount: props.length,
      fallbackDate,
      statsSource: "mlb-stats-api",
      generatedAt: getDateKey(),
    },
  };
}
