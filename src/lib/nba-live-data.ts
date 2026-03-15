import { getNBASchedule, getRecentNBAGames } from "@/lib/nba-api";
import { getScheduleDaysAhead } from "@/lib/date-utils";
import { getNBAOdds } from "@/lib/nba-odds";
import { getBestOdds } from "@/lib/odds-api";
import { findNBAOddsForGame } from "@/lib/nba-odds";
import { buildNBAStatsPropFeed } from "@/lib/nba-stats-engine";
import { buildNBATeamTrends } from "@/lib/nba-team-trends";

function attachLiveOddsToSchedule(
  games: Awaited<ReturnType<typeof getNBASchedule>>,
  events: Awaited<ReturnType<typeof getNBAOdds>>
) {
  return games.map((game) => {
    const event = findNBAOddsForGame(events, game.homeTeam.abbreviation, game.awayTeam.abbreviation);
    if (!event) return game;

    const homeOdds = getBestOdds(event, "h2h", event.home_team);
    const awayOdds = getBestOdds(event, "h2h", event.away_team);

    return {
      ...game,
      oddsEventId: event.id,
      bestMoneyline: {
        home: homeOdds,
        away: awayOdds,
      },
    };
  });
}

export async function getNBADashboardData() {
  // Fetch schedule + recent games (14 days for enough player data) + odds in parallel
  const [schedule, recentGames, odds] = await Promise.all([
    getNBASchedule(getScheduleDaysAhead()),
    getRecentNBAGames(14),
    getNBAOdds(),
  ]);

  // Filter out completed games — only keep upcoming/live games for picks & trends
  const activeGames = schedule.filter((g) => g.status !== "Final");
  const gamesWithOdds = attachLiveOddsToSchedule(
    activeGames.length > 0 ? activeGames : schedule,
    odds
  );

  // Pass recentGames in so stats engine doesn't re-fetch
  const [props, teamTrends] = await Promise.all([
    buildNBAStatsPropFeed(gamesWithOdds, { maxGames: 2, maxPlayers: 4, recentGames }),
    buildNBATeamTrends(gamesWithOdds),
  ]);

  return {
    schedule: attachLiveOddsToSchedule(schedule, odds), // full schedule for display
    props,
    teamTrends,
    odds,
    meta: {
      league: "NBA",
      oddsConnected: odds.length > 0,
      gamesCount: gamesWithOdds.length,
      propsCount: props.length,
      statsSource: "espn",
      _debug: {
        totalSchedule: schedule.length,
        activeGames: gamesWithOdds.length,
        recentGamesCount: recentGames.length,
        recentTeams: Array.from(new Set(recentGames.flatMap(g => [g.homeTeam.abbreviation, g.awayTeam.abbreviation]))).length,
      },
    },
  };
}

export async function getNBATrendData() {
  const [schedule, recentGames, odds] = await Promise.all([
    getNBASchedule(getScheduleDaysAhead()),
    getRecentNBAGames(14),
    getNBAOdds(),
  ]);

  // For trends, include recent completed games so trend data is populated
  const gamesWithOdds = attachLiveOddsToSchedule(schedule, odds);

  const [props, teamTrends] = await Promise.all([
    buildNBAStatsPropFeed(gamesWithOdds, { maxGames: 2, maxPlayers: 4, recentGames }),
    buildNBATeamTrends(gamesWithOdds),
  ]);

  return {
    props,
    teamTrends,
    meta: {
      league: "NBA",
      oddsConnected: odds.length > 0,
      gamesCount: gamesWithOdds.length,
      propsCount: props.length,
      statsSource: "espn",
    },
  };
}
