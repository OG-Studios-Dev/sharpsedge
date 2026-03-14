/**
 * NBA Stats Engine (ESPN-powered)
 * Derives player prop lines from ESPN boxscore data for recent completed games.
 * No API key required.
 *
 * Pipeline:
 *  1. Take today/tomorrow scheduled games from ESPN
 *  2. For each playing team, fetch last 10 completed games via ESPN scoreboard
 *  3. Parse player stats from each game's boxscore
 *  4. Compute rolling averages + hit rates for Points, Rebounds, Assists, 3PM
 *  5. Generate model prop lines + edge scores
 *  6. Return ranked list, highest-edge first
 */

import { OddsEvent, PlayerProp } from "@/lib/types";
import { NBAGame, getNBABoxscore, NBA_TEAM_COLORS } from "@/lib/nba-api";
import { getPlayerPropOdds, type PlayerPropOdds } from "@/lib/odds-api";
import { getNBAEventOdds } from "@/lib/nba-odds";

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210;

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

const NBA_PROP_DEFS = [
  { key: "points" as const, label: "Points", market: "player_points", minLine: 5 },
  { key: "rebounds" as const, label: "Rebounds", market: "player_rebounds", minLine: 2 },
  { key: "assists" as const, label: "Assists", market: "player_assists", minLine: 2 },
  { key: "threePointersMade" as const, label: "3-Pointers Made", market: "player_threes", minLine: 0.5 },
];

type StatKey = typeof NBA_PROP_DEFS[number]["key"];

type GameStat = {
  points: number;
  rebounds: number;
  assists: number;
  threePointersMade: number;
  minutes: number;
};

async function getPlayerRecentStats(
  playerName: string,
  teamAbbrev: string,
  recentGames: NBAGame[]
): Promise<GameStat[]> {
  const logs: GameStat[] = [];
  const teamGames = recentGames
    .filter(g => g.status === "Final" &&
      (g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev))
    .slice(0, 12);

  for (const game of teamGames) {
    try {
      const box = await getNBABoxscore(game.id);
      const isHome = game.homeTeam.abbreviation === teamAbbrev;
      const teamPlayers = isHome ? box.home : box.away;
      const nameLower = playerName.toLowerCase();
      const p = teamPlayers.find(pl =>
        pl.name.toLowerCase().includes(nameLower.split(" ").pop() ?? "") &&
        pl.name.toLowerCase().includes(nameLower.split(" ")[0] ?? "")
      );
      if (!p) continue;
      const mins = parseFloat(p.minutes) || 0;
      if (mins < 15) continue;
      logs.push({
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        threePointersMade: parseInt(p.threePointers.split("-")[0]) || 0,
        minutes: mins,
      });
    } catch {
      // skip failed boxscore
    }
    if (logs.length >= 10) break;
  }
  return logs;
}

function computeHitRate(logs: GameStat[], key: StatKey, line: number): number {
  if (!logs.length) return 0;
  const hits = logs.filter(g => g[key] > line).length;
  return Number(((hits / logs.length) * 100).toFixed(1));
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function pickBestPropPrice(
  logs: GameStat[],
  key: StatKey,
  modelLine: number,
  oddsOptions: PlayerPropOdds[]
) {
  const sample = logs.slice(0, 10);
  if (sample.length < 3) return null;

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
    const hits = sample.filter((game) => game[key] > candidate.line).length;
    const hitRate = hits / sample.length;
    const edge = hitRate - candidate.impliedProbability;

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
  playerName: string,
  team: string,
  opponent: string,
  isAway: boolean,
  teamColor: string,
  logs: GameStat[],
  propDef: typeof NBA_PROP_DEFS[number],
  matchup: string,
  gameId: string,
  eventOdds?: OddsEvent | null
): PlayerProp | null {
  const vals = logs.map(g => g[propDef.key]);
  const avg10 = vals.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(vals.length, 10);
  // Set line at floor-half below average to create natural over bias
  // e.g. avg 26.3 → line 25.5, avg 8.0 → line 7.5
  const modelLine = Math.max(Math.floor(avg10 * 2) / 2, propDef.minLine);
  const recentGames = vals.slice(0, 10);
  const oddsOptions = getPlayerPropOdds(eventOdds, propDef.market, playerName);
  const bestMarket = pickBestPropPrice(logs, propDef.key, modelLine, oddsOptions);

  if (!bestMarket) return null;

  const hitRate = Number((bestMarket.hitRate * 100).toFixed(1));
  const edge = bestMarket.edge;
  const line = bestMarket.line;

  // Only filter if edge is significantly negative (allow small negative for display)
  if (edge < -0.05) return null;

  const bookSummary = bestMarket.book !== "Model Line"
    ? ` Best price: ${bestMarket.book} ${formatAmericanOdds(bestMarket.odds)} at ${line}.`
    : "";

  return {
    id: `nba-${team}-${playerName.replace(/\s+/g, "-")}-${propDef.key}`,
    league: "NBA",
    playerName,
    team,
    teamColor,
    opponent,
    isAway,
    matchup,
    propType: propDef.label,
    line,
    direction: "Over",
    overUnder: "Over",
    odds: bestMarket.odds,
    book: bestMarket.book,
    impliedProb: Number((bestMarket.impliedProbability * 100).toFixed(1)),
    hitRate,
    recentGames,
    edgePct: edge,
    edge,
    fairProbability: hitRate / 100,
    fairOdds: null,
    gameId,
    splits: [
      {
        label: `L${Math.min(logs.length, 10)}: ${logs.slice(0, 10).filter(g => g[propDef.key] > line).length}/${Math.min(logs.length, 10)} over ${line}`,
        hitRate,
        hits: logs.slice(0, 10).filter(g => g[propDef.key] > line).length,
        total: Math.min(logs.length, 10),
        type: "last_n",
      },
    ],
    indicators: [],
    reasoning: `${playerName} is over ${line} ${propDef.label.toLowerCase()} in ${hitRate.toFixed(1)}% of the last ${Math.min(logs.length, 10)} qualifying games. Edge vs implied probability: +${(edge * 100).toFixed(1)}%.${bookSummary}`,
    summary: `${matchup} • Over ${line} ${propDef.label} • L10 avg ${avg10.toFixed(1)}`,
  };
}

export async function buildNBAStatsPropFeed(
  games: NBAGame[],
  opts: { maxGames?: number; maxPlayers?: number; recentGames?: NBAGame[] } = {}
): Promise<PlayerProp[]> {
  const { maxGames = 2, maxPlayers = 4 } = opts;
  if (!games.length) return [];

  const recentGames: NBAGame[] = opts.recentGames ?? [];
  const allProps: PlayerProp[] = [];

  console.log(`[nba-stats] input: ${games.length} games, ${recentGames.length} recentGames, maxGames=${maxGames}, maxPlayers=${maxPlayers}`);

  // Only process non-completed games
  const activeGames = games.filter(g => g.status !== "Final");
  const targetGames = (activeGames.length > 0 ? activeGames : games).slice(0, maxGames);
  console.log(`[nba-stats] activeGames: ${activeGames.length}, targetGames: ${targetGames.length}`);

  // Pre-fetch all discovery boxscores in parallel (1 per team, not 3)
  const allTeamAbbrevs = new Set<string>();
  targetGames.forEach(g => {
    allTeamAbbrevs.add(g.homeTeam.abbreviation);
    allTeamAbbrevs.add(g.awayTeam.abbreviation);
  });

  // For each team, find their most recent completed game for player discovery
  const discoveryGameMap = new Map<string, NBAGame>();
  for (const abbrev of Array.from(allTeamAbbrevs)) {
    const teamGame = recentGames.find(g =>
      g.status === "Final" &&
      (g.homeTeam.abbreviation === abbrev || g.awayTeam.abbreviation === abbrev)
    );
    if (teamGame) discoveryGameMap.set(abbrev, teamGame);
  }
  console.log(`[nba-stats] teams: ${Array.from(allTeamAbbrevs).join(',')}, discoveryGames: ${discoveryGameMap.size}`);

  // Parallel-fetch all discovery boxscores (one per team)
  const discoveryIds = Array.from(new Set(Array.from(discoveryGameMap.values()).map(g => g.id)));
  const boxscoreCache = new Map<string, Awaited<ReturnType<typeof getNBABoxscore>>>();
  await Promise.all(
    discoveryIds.map(async (id) => {
      try {
        const box = await getNBABoxscore(id);
        boxscoreCache.set(id, box);
      } catch { /* skip */ }
    })
  );

  // Discover top players per team from cached boxscores
  const getTopPlayers = (teamAbbrev: string): string[] => {
    const discoveryGame = discoveryGameMap.get(teamAbbrev);
    if (!discoveryGame) return [];
    const box = boxscoreCache.get(discoveryGame.id);
    if (!box) return [];
    const isHome = discoveryGame.homeTeam.abbreviation === teamAbbrev;
    const teamPlayers = isHome ? box.home : box.away;
    return teamPlayers
      .filter(p => parseFloat(p.minutes) >= 20)
      .sort((a, b) => b.points - a.points)
      .slice(0, maxPlayers)
      .map(p => p.name);
  };

  // Build all player tasks across all games
  type PlayerTask = { name: string; team: string; opp: string; isAway: boolean; matchup: string; gameId: string; oddsEventId?: string };
  const playerTasks: PlayerTask[] = [];

  for (const game of targetGames) {
    const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;
    const homePlayers = getTopPlayers(game.homeTeam.abbreviation);
    const awayPlayers = getTopPlayers(game.awayTeam.abbreviation);

    for (const name of homePlayers) {
      playerTasks.push({ name, team: game.homeTeam.abbreviation, opp: game.awayTeam.abbreviation, isAway: false, matchup, gameId: game.id, oddsEventId: game.oddsEventId });
    }
    for (const name of awayPlayers) {
      playerTasks.push({ name, team: game.awayTeam.abbreviation, opp: game.homeTeam.abbreviation, isAway: true, matchup, gameId: game.id, oddsEventId: game.oddsEventId });
    }
  }

  console.log(`[nba-stats] playerTasks: ${playerTasks.length} players across ${new Set(playerTasks.map(t=>t.team)).size} teams`);

  // Pre-fetch all needed stat boxscores in parallel
  // Find all recent games relevant to any player's team
  const neededTeams = new Set(playerTasks.map(t => t.team));
  const statGameIds = new Set<string>();
  for (const team of Array.from(neededTeams)) {
    const teamGames = recentGames
      .filter(g => g.status === "Final" && (g.homeTeam.abbreviation === team || g.awayTeam.abbreviation === team))
      .slice(0, 5);
    teamGames.forEach(g => statGameIds.add(g.id));
  }

  // Fetch all stat boxscores in parallel (skip already cached ones)
  const uncachedIds = Array.from(statGameIds).filter(id => !boxscoreCache.has(id));
  const BATCH_SIZE = 10;
  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    const batch = uncachedIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const box = await getNBABoxscore(id);
          boxscoreCache.set(id, box);
        } catch { /* skip */ }
      })
    );
  }

  // Now build props for each player using cached boxscores
  const getPlayerStatsCached = (playerName: string, teamAbbrev: string): GameStat[] => {
    const logs: GameStat[] = [];
    const teamGames = recentGames
      .filter(g => g.status === "Final" && (g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev))
      .slice(0, 10);

    const nameLower = playerName.toLowerCase();
    const lastName = nameLower.split(" ").pop() ?? "";
    const firstName = nameLower.split(" ")[0] ?? "";

    for (const game of teamGames) {
      const box = boxscoreCache.get(game.id);
      if (!box) continue;
      const isHome = game.homeTeam.abbreviation === teamAbbrev;
      const teamPlayers = isHome ? box.home : box.away;
      const p = teamPlayers.find(pl =>
        pl.name.toLowerCase().includes(lastName) &&
        pl.name.toLowerCase().includes(firstName)
      );
      if (!p) continue;
      const mins = parseFloat(p.minutes) || 0;
      if (mins < 15) continue;
      logs.push({
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        threePointersMade: parseInt(p.threePointers.split("-")[0]) || 0,
        minutes: mins,
      });
      if (logs.length >= 10) break;
    }
    return logs;
  };

  // Fetch event odds in parallel per unique oddsEventId
  const oddsMap = new Map<string, OddsEvent | null>();
  const uniqueOddsIds = Array.from(new Set(playerTasks.map(t => t.oddsEventId).filter(Boolean))) as string[];
  await Promise.all(
    uniqueOddsIds.map(async (id) => {
      try {
        const odds = await getNBAEventOdds(id);
        oddsMap.set(id, odds);
      } catch {
        oddsMap.set(id, null);
      }
    })
  );

  // Generate props (no more async — everything is cached)
  let skippedLowLogs = 0;
  let skippedNoEdge = 0;
  let generated = 0;
  for (const task of playerTasks) {
    const logs = getPlayerStatsCached(task.name, task.team);
    if (logs.length < 3) { skippedLowLogs++; continue; }
    const color = NBA_TEAM_COLORS[task.team] ?? "#4a9eff";
    const eventOdds = task.oddsEventId ? (oddsMap.get(task.oddsEventId) ?? null) : null;
    for (const propDef of NBA_PROP_DEFS) {
      const prop = buildProp(task.name, task.team, task.opp, task.isAway, color, logs, propDef, task.matchup, task.gameId, eventOdds);
      if (prop) { allProps.push(prop); generated++; }
      else { skippedNoEdge++; }
    }
  }
  console.log(`[nba-stats] result: ${generated} props generated, ${skippedLowLogs} players skipped (low logs), ${skippedNoEdge} props skipped (no edge)`);

  return allProps.sort((a, b) => (b.edgePct ?? 0) - (a.edgePct ?? 0));
}
