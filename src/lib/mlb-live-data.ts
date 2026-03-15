import { getDateKey, getScheduleDaysAhead } from "@/lib/date-utils";
import { getAllOdds, getBestOdds } from "@/lib/odds-api";
import {
  MLBGame,
  getCurrentMLBSeason,
  getMLBSchedule,
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
      moneylineBookOdds: {
        home: getAllOdds(event, "h2h", event.home_team),
        away: getAllOdds(event, "h2h", event.away_team),
      },
      bestRunLine: {
        home: homeRunLine,
        away: awayRunLine,
      },
      runLineBookOdds: {
        home: homeRunLine ? getAllOdds(event, "spreads", event.home_team, homeRunLine.line) : [],
        away: awayRunLine ? getAllOdds(event, "spreads", event.away_team, awayRunLine.line) : [],
      },
      bestTotal: total,
      totalBookOdds: total
        ? {
            over: getAllOdds(event, "totals", "Over", total.line),
            under: getAllOdds(event, "totals", "Under", total.line),
          }
        : null,
    };
  });
}

async function getDashboardInputs() {
  const [schedule, recentGames, odds] = await Promise.all([
    getMLBSchedule(getScheduleDaysAhead()),
    getRecentMLBGames(21),
    getMLBOdds(),
  ]);

  const scheduleWithOdds = attachLiveOddsToSchedule(schedule, odds);
  return {
    season: getCurrentMLBSeason(),
    schedule: scheduleWithOdds,
    analysisGames: scheduleWithOdds,
    recentGames,
    odds,
    fallbackDate: null as string | null,
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
