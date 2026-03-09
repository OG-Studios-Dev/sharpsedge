import { getUpcomingSchedule } from "@/lib/nhl-api";
import { findOddsForGame, getBestOdds, getNHLOdds } from "@/lib/odds-api";
import { NHLGame } from "@/lib/types";
import { buildLivePropFeed } from "@/lib/live-props";

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
    getUpcomingSchedule(3),
    getNHLOdds(),
  ]);

  const games = attachLiveOddsToSchedule(schedule.games, odds);
  const rankedProps = odds.length > 0 ? await buildLivePropFeed(games, odds) : [];

  return {
    schedule: {
      ...schedule,
      games,
    },
    props: rankedProps,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: games.length,
      propsCount: rankedProps.length,
      liveOnly: true,
    },
  };
}
