import { getUpcomingSchedule, NHL_TEAM_COLORS } from "@/lib/nhl-api";
import { findOddsForGame, getBestOdds, getNHLOdds } from "@/lib/odds-api";
import { buildPropsPayload } from "@/lib/props";
import { NHLGame, PlayerProp } from "@/lib/types";
import { rankProps } from "@/lib/edge-engine-v2";
import { enrichPropsWithLiveHistory } from "@/lib/nhl-prop-model";

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

function mapPropsToScheduledGames(props: PlayerProp[], games: NHLGame[]) {
  return props
    .map((prop) => {
      const exactGame = games.find(
        (g) =>
          (g.homeTeam.abbrev === prop.team || g.awayTeam.abbrev === prop.team) &&
          (g.homeTeam.abbrev === prop.opponent || g.awayTeam.abbrev === prop.opponent)
      );

      const fallbackGame = games.find(
        (g) => g.homeTeam.abbrev === prop.team || g.awayTeam.abbrev === prop.team
      );

      const game = exactGame || fallbackGame;
      if (!game) return null;

      const derivedOpponent = game.homeTeam.abbrev === prop.team ? game.awayTeam.abbrev : game.homeTeam.abbrev;
      const event = `${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`;
      const teamOdds = game.homeTeam.abbrev === prop.team ? game.bestMoneyline?.home : game.bestMoneyline?.away;

      return {
        ...prop,
        opponent: derivedOpponent,
        matchup: event,
        teamColor: NHL_TEAM_COLORS[prop.team] || prop.teamColor,
        book: teamOdds?.book || prop.book,
        odds: teamOdds?.odds || prop.odds,
        summary: `${event} • ${prop.overUnder} ${prop.line} ${prop.propType}`,
      };
    })
    .filter(Boolean) as PlayerProp[];
}

export async function getLiveDashboardData() {
  const [schedule, odds] = await Promise.all([
    getUpcomingSchedule(3),
    getNHLOdds(),
  ]);

  const games = attachLiveOddsToSchedule(schedule.games, odds);
  const scheduledProps = mapPropsToScheduledGames(buildPropsPayload(), games);
  const modeledProps = await enrichPropsWithLiveHistory(scheduledProps);
  const rankedProps = rankProps(modeledProps);

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
    },
  };
}
