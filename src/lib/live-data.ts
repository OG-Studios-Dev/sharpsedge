import { getUpcomingSchedule, getBroadSchedule } from "@/lib/nhl-api";
import { findOddsForGame, getBestOdds, getNHLOdds } from "@/lib/odds-api";
import { NHLGame, TeamTrend } from "@/lib/types";
import { buildNHLStatsPropFeed } from "@/lib/nhl-stats-engine";
import { buildLiveTeamTrends } from "@/lib/nhl-team-trends";
import { buildPropsPayload } from "@/lib/props";
import { teamTrends as seedTeamTrends } from "@/data/seed";
import { getDateKey } from "@/lib/date-utils";

const ACTIVE_STATES = ["FUT", "LIVE", "PRE"];

function buildSeedTeamTrendPayload(): TeamTrend[] {
  return seedTeamTrends.map((trend, index) => {
    const primarySplit = trend.splits.find((split) => split.total > 0) ?? trend.splits[0];
    const hitRate = primarySplit?.hitRate ?? 0;
    const indicators = trend.indicators && trend.indicators.length > 0
      ? trend.indicators
      : hitRate >= 85
        ? [{ type: "lock" as const, active: true }, { type: "hot" as const, active: true }]
        : hitRate >= 70
          ? [{ type: "hot" as const, active: true }]
          : [];

    return {
      ...trend,
      id: trend.id || `seed-team-${index}`,
      gameId: trend.gameId || `seed-${trend.team}-${trend.opponent}`,
      hitRate,
      edge: trend.edge ?? Math.round(hitRate - 52.4),
      indicators,
    };
  });
}

function withFallbackData(
  props: Awaited<ReturnType<typeof buildPropsPayload>>,
  teamTrends: TeamTrend[],
) {
  return {
    props: props.length > 0 ? props : buildPropsPayload(),
    teamTrends: teamTrends.length > 0 ? teamTrends : buildSeedTeamTrendPayload(),
  };
}

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
  const fallback = withFallbackData(rankedProps, teamTrends);

  return {
    props: fallback.props,
    teamTrends: fallback.teamTrends,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: uniqueGames.length,
      propsCount: fallback.props.length,
      liveOnly: false,
      statsSource: rankedProps.length > 0 ? "live-nhl" : "seed",
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
  const fallback = withFallbackData(rankedProps, teamTrends);

  return {
    schedule: {
      ...schedule,
      games: gamesWithOdds,
      date: schedule.date || getDateKey(),
    },
    props: fallback.props,
    teamTrends: fallback.teamTrends,
    meta: {
      oddsConnected: odds.length > 0,
      gamesCount: gamesWithOdds.length,
      propsCount: fallback.props.length,
      liveOnly: rankedProps.length > 0,
      statsSource: rankedProps.length > 0 ? "live-nhl" : "seed",
    },
  };
}
