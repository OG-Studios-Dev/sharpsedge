import { PlayerProp } from "@/lib/types";
import { getPlayerGameLog, getTeamRoster } from "@/lib/nhl-api";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z ]/g, "").trim();
}

function getStatValue(game: any, propType: string): number | null {
  const key = propType.toLowerCase();
  if (key.includes("shots")) return game.shots ?? game.sog ?? null;
  if (key.includes("assist")) return game.assists ?? null;
  if (key === "goals" || key === "goal") return game.goals ?? null;
  if (key.includes("point")) {
    const goals = game.goals ?? 0;
    const assists = game.assists ?? 0;
    return goals + assists;
  }
  return null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function probabilityFromGames(values: number[], line: number, direction: "Over" | "Under") {
  if (!values.length) return null;
  const hits = values.filter((value) => (direction === "Over" ? value > line : value < line)).length;
  return hits / values.length;
}

function probabilityToAmerican(probability: number): number {
  if (probability <= 0 || probability >= 1) return 0;
  if (probability >= 0.5) return Math.round((-probability / (1 - probability)) * 100);
  return Math.round(((1 - probability) / probability) * 100);
}

async function findPlayerId(team: string, playerName: string): Promise<number | null> {
  const roster = await getTeamRoster(team);
  const target = normalizeName(playerName);

  const match = roster.find((player: any) => {
    const first = player.firstName?.default || "";
    const last = player.lastName?.default || "";
    const fullName = normalizeName(`${first} ${last}`);
    const abbreviated = normalizeName(`${first.slice(0, 1)} ${last}`);
    return fullName === target || abbreviated === target;
  });

  return match?.id ?? null;
}

export async function enrichPropWithLiveHistory(prop: PlayerProp): Promise<PlayerProp> {
  try {
    const playerId = await findPlayerId(prop.team, prop.playerName);
    if (!playerId) {
      return prop;
    }

    const gameLog = await getPlayerGameLog(playerId);
    const values = gameLog
      .map((game) => getStatValue(game, prop.propType))
      .filter((value): value is number => typeof value === "number");

    if (values.length < 3) {
      return { ...prop, playerId };
    }

    const last5 = values.slice(0, 5);
    const last10 = values.slice(0, 10);
    const projection = average(last10);
    const fairProbability = probabilityFromGames(last10, prop.line, prop.overUnder);
    const fairOdds = fairProbability ? probabilityToAmerican(fairProbability) : null;
    const edgePct = fairProbability ? Math.round((fairProbability * 100) - (prop.impliedProb ?? 0)) : null;

    return {
      ...prop,
      playerId,
      projection: projection !== null ? Number(projection.toFixed(2)) : null,
      fairProbability: fairProbability !== null ? Number((fairProbability * 100).toFixed(1)) : null,
      fairOdds,
      edgePct,
      rollingAverages: {
        last5: average(last5) !== null ? Number(average(last5)!.toFixed(2)) : prop.rollingAverages?.last5 ?? null,
        last10: average(last10) !== null ? Number(average(last10)!.toFixed(2)) : prop.rollingAverages?.last10 ?? null,
      },
      recentGames: last10,
      reasoning: fairProbability
        ? `${prop.playerName} projects for ${projection?.toFixed(2)} ${prop.propType.toLowerCase()} based on recent NHL game logs. Fair odds project to ${fairOdds}.`
        : prop.reasoning,
      summary: fairProbability
        ? `${prop.playerName} projects ${projection?.toFixed(2)} vs line ${prop.line}. Fair probability ${Number((fairProbability * 100).toFixed(1))}%.`
        : prop.summary,
      statsSource: "live-nhl",
    };
  } catch {
    return prop;
  }
}

export async function enrichPropsWithLiveHistory(props: PlayerProp[]): Promise<PlayerProp[]> {
  return Promise.all(props.map(enrichPropWithLiveHistory));
}
