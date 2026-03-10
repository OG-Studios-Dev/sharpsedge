import { PlayerProp, OddsEvent } from "@/lib/types";
import { getPlayerGameLog, getTeamRoster, NHL_TEAM_COLORS } from "@/lib/nhl-api";
import { findOddsForGame } from "@/lib/odds-api";
import { enrichPropsWithLiveHistory } from "@/lib/nhl-prop-model";
import { rankProps } from "@/lib/edge-engine-v2";
import { NHLGame } from "@/lib/types";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z ]/g, "").trim();
}

async function rosterMap(team: string) {
  const roster = await getTeamRoster(team);
  return new Map(
    roster.map((player: any) => {
      const first = player.firstName?.default || "";
      const last = player.lastName?.default || "";
      const fullName = `${first} ${last}`.trim();
      return [normalizeName(fullName), { id: player.id, name: fullName }];
    })
  );
}

function marketToPropType(market: string): string | null {
  if (market === "player_points") return "Points";
  if (market === "player_shots_on_goal") return "Shots on Goal";
  if (market === "player_assists") return "Assists";
  if (market === "player_goals") return "Goals";
  return null;
}

function oppositeTeam(game: NHLGame, team: string) {
  return game.homeTeam.abbrev === team ? game.awayTeam.abbrev : game.homeTeam.abbrev;
}

export async function buildLivePropFeed(games: NHLGame[], odds: OddsEvent[]) {
  const props: PlayerProp[] = [];

  for (const game of games) {
    const event = findOddsForGame(odds, game.homeTeam.abbrev, game.awayTeam.abbrev);
    if (!event) continue;

    const [homeRoster, awayRoster] = await Promise.all([
      rosterMap(game.homeTeam.abbrev),
      rosterMap(game.awayTeam.abbrev),
    ]);

    for (const bookmaker of event.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        const propType = marketToPropType(market.key);
        if (!propType) continue;

        for (const outcome of market.outcomes || []) {
          if (typeof outcome.point !== "number") continue;
          const normalized = normalizeName(outcome.name || "");
          const homePlayer = homeRoster.get(normalized);
          const awayPlayer = awayRoster.get(normalized);
          const player = homePlayer || awayPlayer;
          if (!player) continue;

          const team = homePlayer ? game.homeTeam.abbrev : game.awayTeam.abbrev;
          const prop: PlayerProp = {
            id: `${event.id}-${market.key}-${player.id}-${outcome.name}-${outcome.point}`,
            playerId: player.id,
            playerName: player.name,
            team,
            teamColor: NHL_TEAM_COLORS[team] || "#4a9eff",
            opponent: oppositeTeam(game, team),
            isAway: game.awayTeam.abbrev === team,
            propType,
            line: outcome.point,
            overUnder: outcome.name === "Over" ? "Over" : "Under",
            odds: outcome.price,
            book: bookmaker.title,
            splits: [],
            indicators: [],
            league: "NHL",
            matchup: `${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`,
            recommendation: `${outcome.name} ${outcome.point} ${propType}`,
            direction: outcome.name === "Over" ? "Over" : "Under",
            confidence: 0,
            confidenceBreakdown: {
              recentForm: 0,
              matchup: 0,
              situational: 0,
            },
            rollingAverages: {
              last5: null,
              last10: null,
            },
            isBackToBack: false,
            recentGames: [],
            reasoning: "Live prop market detected. Pulling current-slate NHL history and pricing context.",
            summary: `${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev} • ${outcome.name} ${outcome.point} ${propType}`,
            saved: false,
            impliedProb: undefined,
            hitRate: undefined,
            edge: undefined,
            score: undefined,
            statsSource: "seed",
          };

          props.push(prop);
        }
      }
    }
  }

  const deduped = Array.from(new Map(props.map((prop) => [prop.id, prop])).values());
  const enriched = await enrichPropsWithLiveHistory(deduped);
  return rankProps(enriched.filter((prop) => prop.statsSource === "live-nhl" && prop.projection !== null && prop.fairOdds !== null));
}
