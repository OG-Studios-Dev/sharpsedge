import { DefenseGrid } from "@/lib/player-research";
import { getNBABoxscore, getRecentNBAGames } from "@/lib/nba-api";
import { getDateKeyWithOffset } from "@/lib/date-utils";
import { getMLBBoxscore, getRecentMLBGames } from "@/lib/mlb-api";

const NHL_BASE = "https://api-web.nhle.com/v1";
const CACHE_TTL = 15 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

type TeamAccumulator = {
  overallGames: number;
  positionGames: number;
  overallTotals: Record<string, number>;
  positionTotals: Record<string, number>;
};

type TeamRankings = {
  overall: Record<string, { rank: number; value: number; sampleSize: number }>;
  vsPosition: Record<string, { rank: number; value: number; sampleSize: number }>;
  teamCount: number;
};

type NBAAllowedPlayer = {
  position: string;
  points: number;
  rebounds: number;
  assists: number;
  threePointersMade: number;
  blocks: number;
  steals: number;
};

type NHLAllowedPlayer = {
  position: string;
  goals: number;
  assists: number;
  points: number;
  shots: number;
};

type MLBAllowedPlayer = {
  position: string;
  hits: number;
  totalBases: number;
  homeRuns: number;
  rbis: number;
  runs: number;
  stolenBases: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

const NBA_METRICS = [
  { label: "PTS", key: "PTS", getValue: (player: NBAAllowedPlayer) => player.points },
  { label: "REB", key: "REB", getValue: (player: NBAAllowedPlayer) => player.rebounds },
  { label: "AST", key: "AST", getValue: (player: NBAAllowedPlayer) => player.assists },
  { label: "3PM", key: "3PM", getValue: (player: NBAAllowedPlayer) => player.threePointersMade },
  { label: "BLK", key: "BLK", getValue: (player: NBAAllowedPlayer) => player.blocks },
  { label: "STL", key: "STL", getValue: (player: NBAAllowedPlayer) => player.steals },
] as const;

const NHL_METRICS = [
  { label: "Goals", key: "Goals", getValue: (player: NHLAllowedPlayer) => player.goals },
  { label: "Assists", key: "Assists", getValue: (player: NHLAllowedPlayer) => player.assists },
  { label: "Shots", key: "Shots", getValue: (player: NHLAllowedPlayer) => player.shots },
  { label: "Points", key: "Points", getValue: (player: NHLAllowedPlayer) => player.points },
] as const;

const MLB_METRICS = [
  { label: "H", key: "H", getValue: (player: MLBAllowedPlayer) => player.hits },
  { label: "TB", key: "TB", getValue: (player: MLBAllowedPlayer) => player.totalBases },
  { label: "HR", key: "HR", getValue: (player: MLBAllowedPlayer) => player.homeRuns },
  { label: "RBI", key: "RBI", getValue: (player: MLBAllowedPlayer) => player.rbis },
  { label: "R", key: "R", getValue: (player: MLBAllowedPlayer) => player.runs },
  { label: "SB", key: "SB", getValue: (player: MLBAllowedPlayer) => player.stolenBases },
] as const;

async function cachedFetch<T>(url: string): Promise<T> {
  const hit = cache.get(url) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }
  const response = await fetch(url, { next: { revalidate: Math.round(CACHE_TTL / 1000) } });
  if (!response.ok) {
    throw new Error(`Fetch error ${response.status}: ${url}`);
  }
  const data = await response.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function makeAccumulator(): TeamAccumulator {
  return {
    overallGames: 0,
    positionGames: 0,
    overallTotals: {},
    positionTotals: {},
  };
}

function normalizeNBAPosition(position: string) {
  const clean = (position || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return "";
  if (clean === "G" || clean === "F" || clean === "C") return clean;
  if (clean.startsWith("PG")) return "PG";
  if (clean.startsWith("SG")) return "SG";
  if (clean.startsWith("SF")) return "SF";
  if (clean.startsWith("PF")) return "PF";
  return clean;
}

function matchesNBAPosition(position: string, target: string) {
  const playerPosition = normalizeNBAPosition(position);
  const normalizedTarget = normalizeNBAPosition(target);
  if (!normalizedTarget) return true;
  if (!playerPosition) return false;
  if (playerPosition === normalizedTarget) return true;
  if (normalizedTarget === "G") return playerPosition === "PG" || playerPosition === "SG" || playerPosition === "G";
  if (normalizedTarget === "F") return playerPosition === "SF" || playerPosition === "PF" || playerPosition === "F";
  if (normalizedTarget === "PG" || normalizedTarget === "SG") return playerPosition === normalizedTarget || playerPosition === "G";
  if (normalizedTarget === "SF" || normalizedTarget === "PF") return playerPosition === normalizedTarget || playerPosition === "F";
  return playerPosition === normalizedTarget;
}

function normalizeMLBPosition(position: string) {
  const clean = (position || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return "";
  if (clean.startsWith("DH")) return "DH";
  if (clean.startsWith("C")) return "C";
  if (clean.startsWith("1B")) return "1B";
  if (clean.startsWith("2B")) return "2B";
  if (clean.startsWith("3B")) return "3B";
  if (clean.startsWith("SS")) return "SS";
  if (clean.startsWith("LF")) return "OF";
  if (clean.startsWith("CF")) return "OF";
  if (clean.startsWith("RF")) return "OF";
  if (clean.startsWith("OF")) return "OF";
  return clean;
}

function matchesMLBPosition(position: string, target: string) {
  const playerPosition = normalizeMLBPosition(position);
  const normalizedTarget = normalizeMLBPosition(target);
  if (!normalizedTarget) return true;
  return playerPosition === normalizedTarget;
}

function normalizeNHLPosition(position: string) {
  const clean = (position || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return "";
  if (clean === "L") return "LW";
  if (clean === "R") return "RW";
  if (clean === "C" || clean === "D" || clean === "LW" || clean === "RW") return clean;
  return clean;
}

function matchesNHLPosition(position: string, target: string) {
  const playerPosition = normalizeNHLPosition(position);
  const normalizedTarget = normalizeNHLPosition(target);
  if (!normalizedTarget) return true;
  return playerPosition === normalizedTarget;
}

function upsertAccumulator(map: Map<string, TeamAccumulator>, team: string) {
  const existing = map.get(team);
  if (existing) return existing;
  const created = makeAccumulator();
  map.set(team, created);
  return created;
}

function buildRankings(
  map: Map<string, TeamAccumulator>,
  metrics: ReadonlyArray<{ label: string; key: string }>
): Map<string, TeamRankings> {
  const teamCount = map.size;
  const overallRanks = new Map<string, Record<string, { rank: number; value: number; sampleSize: number }>>();
  const positionRanks = new Map<string, Record<string, { rank: number; value: number; sampleSize: number }>>();

  for (const metric of metrics) {
    const overallSorted = Array.from(map.entries())
      .map(([team, acc]) => ({
        team,
        value: acc.overallGames ? Number((acc.overallTotals[metric.key] / acc.overallGames).toFixed(1)) : 0,
        sampleSize: acc.overallGames,
      }))
      .sort((a, b) => b.value - a.value);

    overallSorted.forEach((entry, index) => {
      const current = overallRanks.get(entry.team) || {};
      current[metric.label] = { rank: index + 1, value: entry.value, sampleSize: entry.sampleSize };
      overallRanks.set(entry.team, current);
    });

    const positionSorted = Array.from(map.entries())
      .map(([team, acc]) => ({
        team,
        value: acc.positionGames ? Number((acc.positionTotals[metric.key] / acc.positionGames).toFixed(1)) : 0,
        sampleSize: acc.positionGames,
      }))
      .sort((a, b) => b.value - a.value);

    positionSorted.forEach((entry, index) => {
      const current = positionRanks.get(entry.team) || {};
      current[metric.label] = { rank: index + 1, value: entry.value, sampleSize: entry.sampleSize };
      positionRanks.set(entry.team, current);
    });
  }

  return new Map(
    Array.from(map.keys()).map((team) => [
      team,
      {
        overall: overallRanks.get(team) || {},
        vsPosition: positionRanks.get(team) || {},
        teamCount,
      },
    ])
  );
}

async function buildNBARankingsForPosition(position: string): Promise<Map<string, TeamRankings>> {
  const cacheKey = `rankings:nba:${normalizeNBAPosition(position) || "ALL"}`;
  const hit = cache.get(cacheKey) as CacheEntry<Map<string, TeamRankings>> | undefined;
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }

  const recentGames = (await getRecentNBAGames(12)).filter((game) => game.status === "Final").slice(0, 90);
  const boxes = await Promise.all(
    recentGames.map(async (game) => {
      try {
        const box = await getNBABoxscore(game.id);
        return { game, box };
      } catch {
        return null;
      }
    })
  );

  const teamMap = new Map<string, TeamAccumulator>();

  for (const entry of boxes) {
    if (!entry) continue;
    const { game, box } = entry;
    const homeTeam = upsertAccumulator(teamMap, game.homeTeam.abbreviation);
    const awayTeam = upsertAccumulator(teamMap, game.awayTeam.abbreviation);

    const awayPlayers: NBAAllowedPlayer[] = box.away.map((player) => ({
      position: player.position,
      points: player.points,
      rebounds: player.rebounds,
      assists: player.assists,
      threePointersMade: parseInt(player.threePointers.split("-")[0], 10) || 0,
      blocks: player.blocks,
      steals: player.steals,
    }));
    const homePlayers: NBAAllowedPlayer[] = box.home.map((player) => ({
      position: player.position,
      points: player.points,
      rebounds: player.rebounds,
      assists: player.assists,
      threePointersMade: parseInt(player.threePointers.split("-")[0], 10) || 0,
      blocks: player.blocks,
      steals: player.steals,
    }));

    homeTeam.overallGames += 1;
    awayTeam.overallGames += 1;

    for (const metric of NBA_METRICS) {
      homeTeam.overallTotals[metric.key] = (homeTeam.overallTotals[metric.key] || 0) + awayPlayers.reduce((sum, player) => sum + metric.getValue(player), 0);
      awayTeam.overallTotals[metric.key] = (awayTeam.overallTotals[metric.key] || 0) + homePlayers.reduce((sum, player) => sum + metric.getValue(player), 0);
    }

    const awayByPosition = awayPlayers.filter((player) => matchesNBAPosition(player.position, position));
    const homeByPosition = homePlayers.filter((player) => matchesNBAPosition(player.position, position));

    if (awayByPosition.length > 0) {
      homeTeam.positionGames += 1;
      for (const metric of NBA_METRICS) {
        homeTeam.positionTotals[metric.key] = (homeTeam.positionTotals[metric.key] || 0) + awayByPosition.reduce((sum, player) => sum + metric.getValue(player), 0);
      }
    }

    if (homeByPosition.length > 0) {
      awayTeam.positionGames += 1;
      for (const metric of NBA_METRICS) {
        awayTeam.positionTotals[metric.key] = (awayTeam.positionTotals[metric.key] || 0) + homeByPosition.reduce((sum, player) => sum + metric.getValue(player), 0);
      }
    }
  }

  const rankings = buildRankings(
    teamMap,
    NBA_METRICS.map((metric) => ({ label: metric.label, key: metric.key }))
  );

  cache.set(cacheKey, { data: rankings, timestamp: Date.now() });
  return rankings;
}

type NHLRecentGame = {
  id: number;
  homeAbbrev: string;
  awayAbbrev: string;
};

async function getRecentNHLCompletedGames(daysBack = 10) {
  const cacheKey = `nhl:recent:${daysBack}`;
  const hit = cache.get(cacheKey) as CacheEntry<NHLRecentGame[]> | undefined;
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }

  const responses = await Promise.all(
    Array.from({ length: daysBack }, (_, index) => {
      const date = getDateKeyWithOffset(-(index + 1));
      return cachedFetch<any>(`${NHL_BASE}/schedule/${date}`).catch(() => null);
    })
  );

  const games = new Map<number, NHLRecentGame>();
  for (const payload of responses) {
    const gameWeek = Array.isArray(payload?.gameWeek) ? payload.gameWeek : [];
    for (const day of gameWeek) {
      for (const game of day?.games || []) {
        if (game?.gameState !== "OFF") continue;
        const id = Number(game?.id);
        if (!id || games.has(id)) continue;
        games.set(id, {
          id,
          homeAbbrev: game?.homeTeam?.abbrev || "",
          awayAbbrev: game?.awayTeam?.abbrev || "",
        });
      }
    }
  }

  const result = Array.from(games.values()).slice(0, 120);
  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

async function getNHLBoxscore(gameId: number) {
  const cacheKey = `nhl:boxscore:${gameId}`;
  const hit = cache.get(cacheKey) as CacheEntry<any> | undefined;
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }
  const data = await cachedFetch<any>(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

async function buildMLBRankingsForPosition(position: string): Promise<Map<string, TeamRankings>> {
  const cacheKey = `rankings:mlb:${normalizeMLBPosition(position) || "ALL"}`;
  const hit = cache.get(cacheKey) as CacheEntry<Map<string, TeamRankings>> | undefined;
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }

  const recentGames = (await getRecentMLBGames(14)).slice(0, 90);
  const boxes = await Promise.all(
    recentGames.map(async (game) => {
      try {
        const box = await getMLBBoxscore(game.id);
        return { game, box };
      } catch {
        return null;
      }
    })
  );

  const teamMap = new Map<string, TeamAccumulator>();

  for (const entry of boxes) {
    if (!entry) continue;
    const { game, box } = entry;
    const homeTeam = upsertAccumulator(teamMap, game.homeTeam.abbreviation);
    const awayTeam = upsertAccumulator(teamMap, game.awayTeam.abbreviation);
    const homeBatters: MLBAllowedPlayer[] = box.home.filter((player) => !player.isPitcher).map((player) => ({
      position: player.position,
      hits: player.hits,
      totalBases: player.totalBases,
      homeRuns: player.homeRuns,
      rbis: player.rbis,
      runs: player.runs,
      stolenBases: player.stolenBases,
    }));
    const awayBatters: MLBAllowedPlayer[] = box.away.filter((player) => !player.isPitcher).map((player) => ({
      position: player.position,
      hits: player.hits,
      totalBases: player.totalBases,
      homeRuns: player.homeRuns,
      rbis: player.rbis,
      runs: player.runs,
      stolenBases: player.stolenBases,
    }));

    homeTeam.overallGames += 1;
    awayTeam.overallGames += 1;

    for (const metric of MLB_METRICS) {
      homeTeam.overallTotals[metric.key] = (homeTeam.overallTotals[metric.key] || 0) + awayBatters.reduce((sum, player) => sum + metric.getValue(player), 0);
      awayTeam.overallTotals[metric.key] = (awayTeam.overallTotals[metric.key] || 0) + homeBatters.reduce((sum, player) => sum + metric.getValue(player), 0);
    }

    const awayByPosition = awayBatters.filter((player) => matchesMLBPosition(player.position, position));
    const homeByPosition = homeBatters.filter((player) => matchesMLBPosition(player.position, position));

    if (awayByPosition.length > 0) {
      homeTeam.positionGames += 1;
      for (const metric of MLB_METRICS) {
        homeTeam.positionTotals[metric.key] = (homeTeam.positionTotals[metric.key] || 0) + awayByPosition.reduce((sum, player) => sum + metric.getValue(player), 0);
      }
    }

    if (homeByPosition.length > 0) {
      awayTeam.positionGames += 1;
      for (const metric of MLB_METRICS) {
        awayTeam.positionTotals[metric.key] = (awayTeam.positionTotals[metric.key] || 0) + homeByPosition.reduce((sum, player) => sum + metric.getValue(player), 0);
      }
    }
  }

  const rankings = buildRankings(
    teamMap,
    MLB_METRICS.map((metric) => ({ label: metric.label, key: metric.key }))
  );

  cache.set(cacheKey, { data: rankings, timestamp: Date.now() });
  return rankings;
}

async function buildNHLRankingsForPosition(position: string): Promise<Map<string, TeamRankings>> {
  const cacheKey = `rankings:nhl:${normalizeNHLPosition(position) || "ALL"}`;
  const hit = cache.get(cacheKey) as CacheEntry<Map<string, TeamRankings>> | undefined;
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }

  const recentGames = await getRecentNHLCompletedGames(10);
  const boxes = await Promise.all(
    recentGames.map(async (game) => {
      try {
        const box = await getNHLBoxscore(game.id);
        return { game, box };
      } catch {
        return null;
      }
    })
  );

  const teamMap = new Map<string, TeamAccumulator>();

  for (const entry of boxes) {
    if (!entry) continue;
    const { game, box } = entry;
    const homeTeam = upsertAccumulator(teamMap, game.homeAbbrev);
    const awayTeam = upsertAccumulator(teamMap, game.awayAbbrev);
    const playerStats = box?.playerByGameStats || {};
    const homeSkaters: NHLAllowedPlayer[] = [
      ...(playerStats?.homeTeam?.forwards || []),
      ...(playerStats?.homeTeam?.defense || []),
    ].map((player: any) => ({
      position: player?.positionCode || "",
      goals: Number(player?.goals) || 0,
      assists: Number(player?.assists) || 0,
      points: (Number(player?.goals) || 0) + (Number(player?.assists) || 0),
      shots: Number(player?.shots) || 0,
    }));
    const awaySkaters: NHLAllowedPlayer[] = [
      ...(playerStats?.awayTeam?.forwards || []),
      ...(playerStats?.awayTeam?.defense || []),
    ].map((player: any) => ({
      position: player?.positionCode || "",
      goals: Number(player?.goals) || 0,
      assists: Number(player?.assists) || 0,
      points: (Number(player?.goals) || 0) + (Number(player?.assists) || 0),
      shots: Number(player?.shots) || 0,
    }));

    homeTeam.overallGames += 1;
    awayTeam.overallGames += 1;

    for (const metric of NHL_METRICS) {
      homeTeam.overallTotals[metric.key] = (homeTeam.overallTotals[metric.key] || 0) + awaySkaters.reduce((sum, player) => sum + metric.getValue(player), 0);
      awayTeam.overallTotals[metric.key] = (awayTeam.overallTotals[metric.key] || 0) + homeSkaters.reduce((sum, player) => sum + metric.getValue(player), 0);
    }

    const awayByPosition = awaySkaters.filter((player) => matchesNHLPosition(player.position, position));
    const homeByPosition = homeSkaters.filter((player) => matchesNHLPosition(player.position, position));

    if (awayByPosition.length > 0) {
      homeTeam.positionGames += 1;
      for (const metric of NHL_METRICS) {
        homeTeam.positionTotals[metric.key] = (homeTeam.positionTotals[metric.key] || 0) + awayByPosition.reduce((sum, player) => sum + metric.getValue(player), 0);
      }
    }

    if (homeByPosition.length > 0) {
      awayTeam.positionGames += 1;
      for (const metric of NHL_METRICS) {
        awayTeam.positionTotals[metric.key] = (awayTeam.positionTotals[metric.key] || 0) + homeByPosition.reduce((sum, player) => sum + metric.getValue(player), 0);
      }
    }
  }

  const rankings = buildRankings(
    teamMap,
    NHL_METRICS.map((metric) => ({ label: metric.label, key: metric.key }))
  );

  cache.set(cacheKey, { data: rankings, timestamp: Date.now() });
  return rankings;
}

export async function getDefenseGridForPlayer(
  league: "NBA" | "NHL" | "MLB",
  opponent: string,
  position: string
): Promise<DefenseGrid | null> {
  const upperOpponent = (opponent || "").toUpperCase();
  if (!upperOpponent) return null;

  const rankings = league === "NBA"
    ? await buildNBARankingsForPosition(position)
    : league === "MLB"
      ? await buildMLBRankingsForPosition(position)
      : await buildNHLRankingsForPosition(position);

  const opponentRanks = rankings.get(upperOpponent);
  if (!opponentRanks) return null;

  const metrics = league === "NBA" ? NBA_METRICS : league === "MLB" ? MLB_METRICS : NHL_METRICS;
  return {
    opponent: upperOpponent,
    position: league === "NBA" ? normalizeNBAPosition(position) : league === "MLB" ? normalizeMLBPosition(position) : normalizeNHLPosition(position),
    overall: metrics.map((metric) => ({
      label: metric.label,
      rank: opponentRanks.overall[metric.label]?.rank || opponentRanks.teamCount,
      sampleSize: opponentRanks.overall[metric.label]?.sampleSize || 0,
      value: opponentRanks.overall[metric.label]?.value || 0,
    })),
    vsPosition: metrics.map((metric) => ({
      label: metric.label,
      rank: opponentRanks.vsPosition[metric.label]?.rank || opponentRanks.teamCount,
      sampleSize: opponentRanks.vsPosition[metric.label]?.sampleSize || 0,
      value: opponentRanks.vsPosition[metric.label]?.value || 0,
    })),
    teamCount: opponentRanks.teamCount,
  };
}
