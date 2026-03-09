import { getUpcomingSchedule } from "@/lib/nhl-api";
import { findOddsForGame, getBestOdds, getNHLOdds } from "@/lib/odds-api";
import { NHLGame } from "@/lib/types";
import { buildNHLStatsPropFeed } from "@/lib/nhl-stats-engine";

const ACTIVE_STATES = ["FUT", "LIVE", "PRE"];

function attachLiveOddsToSchedule(games: NHLGame[], events: Awaited<ReturnType<typeof getNHLOdds>>) {
  return games.map((game) => {
    const event = findOddsForGame(events, game.homeTeam.abbrev, game.awayTeam.abbrev);
    if (!event) return game;

    const homeOdds = getBestOdds(event, "h2h", event.home_team);
    const awayOdds = getBestOdds(event, "h2h", event.away_team);

    return {
      ...game,
      bestMoneyline: {
        home: homeOdds,
        away: awayOdds,
      },
    };
  });
}

export async function getLiveDashboardData() {
  const [schedule, odds] = await Promise.all([
    getUpcomingSchedule(7),
    getNHLOdds(),
  ]);

  // Only keep active games (not finished)
  const activeGames = schedule.games.filter((g) => ACTIVE_STATES.includes(g.gameState));
  const gamesWithOdds = attachLiveOddsToSchedule(activeGames, odds);

  // Build prop feed from NHL API stats for upcoming/live games
  const rankedProps = await buildNHLStatsPropFeed(gamesWithOdds);

  return {
    schedule: {
      ...schedule,
      games: gamesWithOdds,
    },
    props: rankedProps,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: gamesWithOdds.length,
      propsCount: rankedProps.length,
      liveOnly: true,
      statsSource: "live-nhl",
    },
  };
}
