import { OddsEvent, PlayerProp } from "@/lib/types";
import {
  MLBBoxscorePlayer,
  MLBGame,
  MLBPlayerGameLog,
  MLB_TEAM_COLORS,
  getMLBBoxscore,
  getMLBPlayerGameLog,
} from "@/lib/mlb-api";
import { getPlayerPropOdds, type PlayerPropOdds } from "@/lib/odds-api";
import { getMLBEventOdds } from "@/lib/mlb-odds";
import { buildPlayerSplits } from "@/lib/player-trend";
import { assignIndicators } from "@/lib/trend-indicators";

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210;

type HitterStatKey = "hits" | "totalBases" | "homeRuns" | "rbis" | "runs" | "stolenBases";
type PitcherStatKey = "strikeOuts" | "earnedRuns" | "inningsPitched" | "hitsAllowed";
type StatKey = HitterStatKey | PitcherStatKey;
type PropRole = "hitting" | "pitching";

type GameStat = {
  gameId: string;
  gameDate: string;
  opponentAbbrev: string;
  isHome: boolean;
  hits: number;
  totalBases: number;
  homeRuns: number;
  rbis: number;
  runs: number;
  stolenBases: number;
  strikeOuts: number;
  earnedRuns: number;
  inningsPitched: number;
  hitsAllowed: number;
};

type PropDef = {
  key: StatKey;
  label: string;
  market?: string;
  minLine: number;
  role: PropRole;
};

type PlayerTask = {
  playerId: number;
  playerName: string;
  team: string;
  opponent: string;
  isAway: boolean;
  matchup: string;
  gameId: string;
  role: PropRole;
  oddsEventId?: string;
  starterQuality?: { era?: number | null; whip?: number | null } | null;
};

const MLB_PROP_DEFS: PropDef[] = [
  { key: "hits", label: "Hits", market: "batter_hits", minLine: 0.5, role: "hitting" },
  { key: "totalBases", label: "Total Bases", market: "batter_total_bases", minLine: 0.5, role: "hitting" },
  { key: "homeRuns", label: "Home Runs", market: "batter_home_runs", minLine: 0.5, role: "hitting" },
  { key: "rbis", label: "RBIs", minLine: 0.5, role: "hitting" },
  { key: "runs", label: "Runs Scored", minLine: 0.5, role: "hitting" },
  { key: "stolenBases", label: "Stolen Bases", minLine: 0.5, role: "hitting" },
  { key: "strikeOuts", label: "Strikeouts", market: "pitcher_strikeouts", minLine: 3.5, role: "pitching" },
  { key: "earnedRuns", label: "Earned Runs", minLine: 0.5, role: "pitching" },
  { key: "inningsPitched", label: "Innings Pitched", minLine: 3.5, role: "pitching" },
  { key: "hitsAllowed", label: "Hits Allowed", minLine: 2.5, role: "pitching" },
];

function statValue(game: GameStat, key: StatKey) {
  return game[key];
}

function formatAmericanOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toGameStat(log: MLBPlayerGameLog): GameStat {
  return {
    gameId: log.gameId,
    gameDate: log.gameDate,
    opponentAbbrev: log.opponentAbbrev,
    isHome: log.isHome,
    hits: log.hits,
    totalBases: log.totalBases,
    homeRuns: log.homeRuns,
    rbis: log.rbis,
    runs: log.runs,
    stolenBases: log.stolenBases,
    strikeOuts: log.strikeOuts,
    earnedRuns: log.earnedRuns,
    inningsPitched: log.inningsPitched,
    hitsAllowed: log.hitsAllowed,
  };
}

function matchupModifier(prop: PropDef, starterQuality?: { era?: number | null; whip?: number | null } | null) {
  if (!starterQuality) return 0;

  const era = starterQuality.era ?? null;
  const whip = starterQuality.whip ?? null;

  if (prop.role === "hitting") {
    if ((era !== null && era >= 4.5) || (whip !== null && whip >= 1.32)) return 0.06;
    if ((era !== null && era <= 3.2) || (whip !== null && whip <= 1.12)) return -0.05;
    return 0;
  }

  if (prop.key === "strikeOuts" || prop.key === "inningsPitched") {
    if (era !== null && era <= 3.4) return 0.04;
    if (era !== null && era >= 4.7) return -0.05;
    return 0;
  }

  if (prop.key === "earnedRuns" || prop.key === "hitsAllowed") {
    if (era !== null && era >= 4.7) return 0.05;
    if (era !== null && era <= 3.2) return -0.05;
  }

  return 0;
}

function pickBestPropPrice(
  logs: GameStat[],
  key: StatKey,
  modelLine: number,
  oddsOptions: PlayerPropOdds[],
  edgeAdjustment = 0,
) {
  const sample = logs.slice(0, 10);
  if (sample.length < 5) return null;

  const candidates = oddsOptions.length > 0
    ? oddsOptions
    : [{ odds: STANDARD_JUICE, book: "Model Line", line: modelLine, impliedProbability: STANDARD_IMPLIED_PROB }];

  let best: {
    line: number;
    odds: number;
    book: string;
    impliedProbability: number;
    hitRate: number;
    edge: number;
  } | null = null;

  for (const candidate of candidates) {
    const hits = sample.filter((game) => statValue(game, key) > candidate.line).length;
    const hitRate = hits / sample.length;
    const edge = hitRate - candidate.impliedProbability + edgeAdjustment;

    if (!best || edge > best.edge || (edge === best.edge && candidate.odds > best.odds)) {
      best = {
        line: candidate.line,
        odds: candidate.odds,
        book: candidate.book,
        impliedProbability: candidate.impliedProbability,
        hitRate,
        edge,
      };
    }
  }

  return best;
}

function buildProp(
  task: PlayerTask,
  logs: GameStat[],
  propDef: PropDef,
  eventOdds?: OddsEvent | null,
): PlayerProp | null {
  const recentSample = logs.slice(0, 10);
  if (recentSample.length < 5) return null;

  const values = recentSample.map((game) => statValue(game, propDef.key));
  const avg10 = average(values);
  const modelLine = Math.max(Math.floor(avg10 * 2) / 2, propDef.minLine);
  const oddsOptions = propDef.market
    ? getPlayerPropOdds(eventOdds, propDef.market, task.playerName)
    : [];
  const modifier = matchupModifier(propDef, task.starterQuality);
  const bestMarket = pickBestPropPrice(logs, propDef.key, modelLine, oddsOptions, modifier);

  if (!bestMarket || bestMarket.edge < -0.05) return null;

  const line = bestMarket.line;
  const hitRate = Number((bestMarket.hitRate * 100).toFixed(1));
  const edge = bestMarket.edge;
  const recentGames = recentSample.map((game) => statValue(game, propDef.key));
  const teamColor = MLB_TEAM_COLORS[task.team] || "#4a9eff";
  const starterNote = task.starterQuality?.era != null
    ? ` Opposing starter context: ERA ${task.starterQuality.era.toFixed(2)}.`
    : "";
  const bookSummary = bestMarket.book !== "Model Line"
    ? ` Best price: ${bestMarket.book} ${formatAmericanOdds(bestMarket.odds)} at ${line}.`
    : "";

  return {
    id: `mlb-${task.gameId}-${task.playerId}-${propDef.key}`,
    playerId: task.playerId,
    playerName: task.playerName,
    team: task.team,
    teamColor,
    opponent: task.opponent,
    isAway: task.isAway,
    matchup: task.matchup,
    propType: propDef.label,
    line,
    direction: "Over",
    overUnder: "Over",
    odds: bestMarket.odds,
    book: bestMarket.book,
    impliedProb: Number((bestMarket.impliedProbability * 100).toFixed(1)),
    hitRate,
    edgePct: Number((edge * 100).toFixed(1)),
    edge,
    fairProbability: bestMarket.hitRate,
    fairOdds: null,
    gameId: task.gameId,
    league: "MLB",
    recentGames,
    splits: buildPlayerSplits({
      games: logs.slice(0, 20),
      didHit: (game) => statValue(game, propDef.key) > line,
      isAway: task.isAway,
      opponent: task.opponent,
      lastN: 10,
    }),
    indicators: assignIndicators({
      hitRate,
      edge,
      sampleSize: recentSample.length,
      recentGames,
      line,
      odds: bestMarket.odds,
    }),
    reasoning: `${task.playerName} is over ${line} ${propDef.label.toLowerCase()} in ${hitRate.toFixed(1)}% of the last ${recentSample.length} games.${starterNote}${bookSummary}`,
    summary: `${task.matchup} • Over ${line} ${propDef.label} • L10 avg ${avg10.toFixed(1)}`,
  };
}

function getStarterFromBoxscore(players: MLBBoxscorePlayer[]) {
  return [...players]
    .filter((player) => player.isPitcher && player.inningsPitched > 0)
    .sort((a, b) => (
      b.inningsPitched - a.inningsPitched
      || b.pitchCount - a.pitchCount
      || (a.earnedRuns - b.earnedRuns)
    ))[0] || null;
}

function getTopHitters(players: MLBBoxscorePlayer[], maxHitters: number) {
  return [...players]
    .filter((player) => !player.isPitcher && (player.atBats > 0 || player.battingOrder))
    .sort((a, b) => (
      (b.ops ?? 0) - (a.ops ?? 0)
      || (b.avg ?? 0) - (a.avg ?? 0)
      || b.totalBases - a.totalBases
      || b.hits - a.hits
    ))
    .slice(0, maxHitters);
}

function buildPlayerLogCacheKey(playerId: number, role: PropRole, season: number) {
  return `${playerId}:${role}:${season}`;
}

export async function buildMLBStatsPropFeed(
  games: MLBGame[],
  opts: {
    maxGames?: number;
    maxHitters?: number;
    recentGames?: MLBGame[];
    season?: number;
  } = {},
): Promise<PlayerProp[]> {
  const {
    maxGames = 3,
    maxHitters = 4,
    recentGames = [],
    season = new Date().getFullYear(),
  } = opts;

  if (!games.length) return [];

  const activeGames = games.filter((game) => game.status !== "Final");
  const targetGames = (activeGames.length > 0 ? activeGames : games).slice(0, maxGames);

  const discoveryGames = new Map<string, MLBGame>();
  const teamAbbrevs = new Set<string>();
  targetGames.forEach((game) => {
    teamAbbrevs.add(game.homeTeam.abbreviation);
    teamAbbrevs.add(game.awayTeam.abbreviation);
  });

  for (const team of Array.from(teamAbbrevs)) {
    const latest = recentGames.find((game) =>
      game.status === "Final"
      && (game.homeTeam.abbreviation === team || game.awayTeam.abbreviation === team)
    );
    if (latest) discoveryGames.set(team, latest);
  }

  const boxscoreCache = new Map<string, Awaited<ReturnType<typeof getMLBBoxscore>>>();
  const discoveryIds = Array.from(new Set([
    ...Array.from(discoveryGames.values()).map((game) => game.id),
    ...targetGames.filter((game) => game.status === "Final").map((game) => game.id),
  ]));

  await Promise.all(
    discoveryIds.map(async (gameId) => {
      try {
        const boxscore = await getMLBBoxscore(gameId);
        boxscoreCache.set(gameId, boxscore);
      } catch {
        boxscoreCache.set(gameId, { home: [], away: [] });
      }
    }),
  );

  const tasks: PlayerTask[] = [];
  const seenTaskKeys = new Set<string>();

  for (const game of targetGames) {
    const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;
    const homeDiscoveryGame = discoveryGames.get(game.homeTeam.abbreviation);
    const awayDiscoveryGame = discoveryGames.get(game.awayTeam.abbreviation);
    const homeDiscoveryBox = homeDiscoveryGame ? boxscoreCache.get(homeDiscoveryGame.id) : undefined;
    const awayDiscoveryBox = awayDiscoveryGame ? boxscoreCache.get(awayDiscoveryGame.id) : undefined;

    const homeHitters = getTopHitters(
      game.homeTeam.abbreviation === homeDiscoveryGame?.homeTeam.abbreviation
        ? homeDiscoveryBox?.home ?? []
        : homeDiscoveryBox?.away ?? [],
      maxHitters,
    );
    const awayHitters = getTopHitters(
      game.awayTeam.abbreviation === awayDiscoveryGame?.homeTeam.abbreviation
        ? awayDiscoveryBox?.home ?? []
        : awayDiscoveryBox?.away ?? [],
      maxHitters,
    );

    const currentGameBox = boxscoreCache.get(game.id);
    const homeStarterFromBox = currentGameBox
      ? getStarterFromBoxscore(currentGameBox.home)
      : null;
    const awayStarterFromBox = currentGameBox
      ? getStarterFromBoxscore(currentGameBox.away)
      : null;

    const homeStarter = game.homeTeam.probablePitcher?.id && game.homeTeam.probablePitcher?.name
      ? {
          playerId: Number(game.homeTeam.probablePitcher.id),
          playerName: game.homeTeam.probablePitcher.name,
          starterQuality: {
            era: game.homeTeam.probablePitcher.era ?? null,
            whip: null,
          },
        }
      : homeStarterFromBox
        ? {
            playerId: Number(homeStarterFromBox.id),
            playerName: homeStarterFromBox.name,
            starterQuality: {
              era: homeStarterFromBox.era ?? null,
              whip: homeStarterFromBox.whip ?? null,
            },
          }
        : null;

    const awayStarter = game.awayTeam.probablePitcher?.id && game.awayTeam.probablePitcher?.name
      ? {
          playerId: Number(game.awayTeam.probablePitcher.id),
          playerName: game.awayTeam.probablePitcher.name,
          starterQuality: {
            era: game.awayTeam.probablePitcher.era ?? null,
            whip: null,
          },
        }
      : awayStarterFromBox
        ? {
            playerId: Number(awayStarterFromBox.id),
            playerName: awayStarterFromBox.name,
            starterQuality: {
              era: awayStarterFromBox.era ?? null,
              whip: awayStarterFromBox.whip ?? null,
            },
          }
        : null;

    const pushTask = (task: PlayerTask) => {
      const key = `${task.gameId}:${task.playerId}:${task.role}`;
      if (seenTaskKeys.has(key)) return;
      seenTaskKeys.add(key);
      tasks.push(task);
    };

    homeHitters.forEach((player) => pushTask({
      playerId: Number(player.id),
      playerName: player.name,
      team: game.homeTeam.abbreviation,
      opponent: game.awayTeam.abbreviation,
      isAway: false,
      matchup,
      gameId: game.id,
      role: "hitting",
      oddsEventId: game.oddsEventId,
      starterQuality: awayStarter?.starterQuality ?? null,
    }));

    awayHitters.forEach((player) => pushTask({
      playerId: Number(player.id),
      playerName: player.name,
      team: game.awayTeam.abbreviation,
      opponent: game.homeTeam.abbreviation,
      isAway: true,
      matchup,
      gameId: game.id,
      role: "hitting",
      oddsEventId: game.oddsEventId,
      starterQuality: homeStarter?.starterQuality ?? null,
    }));

    if (homeStarter) {
      pushTask({
        playerId: homeStarter.playerId,
        playerName: homeStarter.playerName,
        team: game.homeTeam.abbreviation,
        opponent: game.awayTeam.abbreviation,
        isAway: false,
        matchup,
        gameId: game.id,
        role: "pitching",
        oddsEventId: game.oddsEventId,
        starterQuality: homeStarter.starterQuality,
      });
    }

    if (awayStarter) {
      pushTask({
        playerId: awayStarter.playerId,
        playerName: awayStarter.playerName,
        team: game.awayTeam.abbreviation,
        opponent: game.homeTeam.abbreviation,
        isAway: true,
        matchup,
        gameId: game.id,
        role: "pitching",
        oddsEventId: game.oddsEventId,
        starterQuality: awayStarter.starterQuality,
      });
    }
  }

  const oddsMap = new Map<string, OddsEvent | null>();
  await Promise.all(
    Array.from(new Set(tasks.map((task) => task.oddsEventId).filter(Boolean))).map(async (eventId) => {
      try {
        const odds = await getMLBEventOdds(eventId);
        oddsMap.set(eventId!, odds);
      } catch {
        oddsMap.set(eventId!, null);
      }
    }),
  );

  const logCache = new Map<string, GameStat[]>();
  await Promise.all(
    tasks.map(async (task) => {
      const key = buildPlayerLogCacheKey(task.playerId, task.role, season);
      if (logCache.has(key)) return;
      const logs = await getMLBPlayerGameLog(task.playerId, season, task.role);
      logCache.set(key, logs.map(toGameStat));
    }),
  );

  const props: PlayerProp[] = [];
  for (const task of tasks) {
    const logs = logCache.get(buildPlayerLogCacheKey(task.playerId, task.role, season)) ?? [];
    if (logs.length < 5) continue;

    const eventOdds = task.oddsEventId ? (oddsMap.get(task.oddsEventId) ?? null) : null;
    for (const propDef of MLB_PROP_DEFS.filter((def) => def.role === task.role)) {
      const prop = buildProp(task, logs, propDef, eventOdds);
      if (prop) props.push(prop);
    }
  }

  return props.sort((a, b) => (
    (b.edgePct ?? 0) - (a.edgePct ?? 0)
    || (b.hitRate ?? 0) - (a.hitRate ?? 0)
  ));
}
