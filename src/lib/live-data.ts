import { getUpcomingSchedule, getBroadSchedule } from "@/lib/nhl-api";
import { findOddsForGame, getBestOdds, getNHLOdds } from "@/lib/odds-api";
import { NHLGame } from "@/lib/types";
import { buildNHLStatsPropFeed } from "@/lib/nhl-stats-engine";
import { buildLiveTeamTrends } from "@/lib/nhl-team-trends";

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

// Used by /api/trends — includes recent completed games so Trends always has data
export async function getLiveTrendData() {
  const [schedule, odds] = await Promise.all([
    getBroadSchedule(4),  // includes OFF games from last few days
    getNHLOdds(),
  ]);

  const gamesWithOdds = attachLiveOddsToSchedule(schedule.games, odds);

  // Deduplicate teams (completed + upcoming may overlap)
  const seen = new Set<string>();
  const uniqueGames = gamesWithOdds.filter((g) => {
    const key = `${g.homeTeam.abbrev}-${g.awayTeam.abbrev}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const [rankedProps, teamTrends] = await Promise.all([
    // Tighter limits for Trends to stay within Vercel timeout
    buildNHLStatsPropFeed(uniqueGames, { maxGames: 3, maxForwards: 4, maxDefense: 2 }),
    buildLiveTeamTrends(uniqueGames),
  ]);

  return {
    props: rankedProps,
    teamTrends,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: uniqueGames.length,
      propsCount: rankedProps.length,
      liveOnly: false,
      statsSource: "live-nhl",
    },
  };
}

export async function getLiveDashboardData() {
  const [schedule, odds] = await Promise.all([
    getUpcomingSchedule(4),
    getNHLOdds(),
  ]);

  // Only keep active games (not finished)
  const activeGames = schedule.games.filter((g) => ACTIVE_STATES.includes(g.gameState));
  const gamesWithOdds = attachLiveOddsToSchedule(activeGames, odds);

  // Build prop feed + team trends in parallel
  const [rankedProps, teamTrends] = await Promise.all([
    buildNHLStatsPropFeed(gamesWithOdds),
    buildLiveTeamTrends(gamesWithOdds),
  ]);

  return {
    schedule: {
      ...schedule,
      games: gamesWithOdds,
    },
    props: rankedProps,
    teamTrends,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: gamesWithOdds.length,
      propsCount: rankedProps.length,
      liveOnly: true,
      statsSource: "live-nhl",
    },
  };
}
