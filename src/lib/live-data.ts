import { getUpcomingSchedule, getBroadSchedule } from "@/lib/nhl-api";
import { getScheduleDaysAhead } from "@/lib/date-utils";
import { findOddsForGame, getAllOdds, getBestOdds, getNHLOdds } from "@/lib/odds-api";
import { getAggregatedOddsEvents } from "@/lib/odds-aggregator";
import { NHLGame } from "@/lib/types";
import { buildNHLStatsPropFeed } from "@/lib/nhl-stats-engine";
import { buildLiveTeamTrends } from "@/lib/nhl-team-trends";
import { getDateKey } from "@/lib/date-utils";

const ACTIVE_STATES = ["FUT", "LIVE", "PRE"];

function attachLiveOddsToSchedule(games: NHLGame[], events: Awaited<ReturnType<typeof getNHLOdds>>) {
  return games.map((game) => {
    const event = findOddsForGame(events, game.homeTeam.abbrev, game.awayTeam.abbrev);
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
      moneylineBookOdds: {
        home: getAllOdds(event, "h2h", event.home_team),
        away: getAllOdds(event, "h2h", event.away_team),
      },
    };
  });
}

// Used by /api/trends — includes recent completed games so Trends always has data
export async function getLiveTrendData() {
  const [schedule, odds] = await Promise.all([
    getBroadSchedule(4),  // includes OFF games from last few days
    getNHLOdds().then(odds => odds.length > 0 ? odds : getAggregatedOddsEvents("NHL")).catch(() => getAggregatedOddsEvents("NHL")),
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
      statsSource: rankedProps.length > 0 || teamTrends.length > 0 ? "live-nhl" : "live-unavailable",
    },
  };
}

export async function getLiveDashboardData() {
  const [schedule, odds] = await Promise.all([
    getUpcomingSchedule(getScheduleDaysAhead() + 1),
    getNHLOdds(),
  ]);

  const targetDate = schedule.date || getDateKey();

  // Only keep active games (not finished)
  const activeGames = schedule.games.filter((g) => (
    ACTIVE_STATES.includes(g.gameState) && getDateKey(new Date(g.startTimeUTC)) === targetDate
  ));
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
      date: targetDate,
    },
    props: rankedProps,
    teamTrends,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: gamesWithOdds.length,
      propsCount: rankedProps.length,
      liveOnly: rankedProps.length > 0,
      statsSource: rankedProps.length > 0 || teamTrends.length > 0 ? "live-nhl" : "live-unavailable",
    },
  };
}
