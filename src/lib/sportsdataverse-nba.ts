/**
 * sportsdataverse-nba.ts
 *
 * NBA quarter score adapter using the sportsdataverse npm package (ESPN endpoints).
 * Used as a FALLBACK/SUPPLEMENT for quarter scores when ESPN direct API or API-Sports
 * data is incomplete or outside the rolling window.
 *
 * Primary use case: grading "Matty's 1Q Chase NBA" system where 1Q line scores are needed.
 */

// Simple in-memory cache (5 min TTL)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SDVQuarterScores {
  homeQ1: number;
  homeQ2: number;
  homeQ3: number;
  homeQ4: number;
  homeFinal: number;
  awayQ1: number;
  awayQ2: number;
  awayQ3: number;
  awayQ4: number;
  awayFinal: number;
}

export interface SDVNBAGame {
  gameId: string;
  homeTeam: string;
  homeTeamAbbrev: string;
  awayTeam: string;
  awayTeamAbbrev: string;
  status: string; // "pre" | "in" | "post"
  date: string;
  quarterScores?: SDVQuarterScores;
}

export interface SDVNBABoxScore {
  gameId: string;
  homeTeam: string;
  homeTeamAbbrev: string;
  awayTeam: string;
  awayTeamAbbrev: string;
  quarterScores: SDVQuarterScores | null;
  status: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractLineScores(competitor: Record<string, unknown>): number[] {
  try {
    const linescores = competitor?.linescores as Array<{ value?: number }> | undefined;
    if (!Array.isArray(linescores)) return [];
    return linescores.map((ls) => Number(ls?.value ?? 0));
  } catch {
    return [];
  }
}

function parseQuarterScores(
  homeCompetitor: Record<string, unknown>,
  awayCompetitor: Record<string, unknown>
): SDVQuarterScores | null {
  const homeScores = extractLineScores(homeCompetitor);
  const awayScores = extractLineScores(awayCompetitor);

  // Need at least 4 quarters
  if (homeScores.length < 4 || awayScores.length < 4) return null;

  const homeScore = homeCompetitor?.score as string | undefined;
  const awayScore = awayCompetitor?.score as string | undefined;

  return {
    homeQ1: homeScores[0],
    homeQ2: homeScores[1],
    homeQ3: homeScores[2],
    homeQ4: homeScores[3],
    homeFinal: homeScore ? parseInt(homeScore, 10) : homeScores.reduce((a, b) => a + b, 0),
    awayQ1: awayScores[0],
    awayQ2: awayScores[1],
    awayQ3: awayScores[2],
    awayQ4: awayScores[3],
    awayFinal: awayScore ? parseInt(awayScore, 10) : awayScores.reduce((a, b) => a + b, 0),
  };
}

function teamNameVariants(name: string): string[] {
  const n = name.toLowerCase().trim();
  // ESPN sometimes uses city only or nickname only
  const parts = n.split(' ');
  return [n, parts[parts.length - 1], parts[0]];
}

function teamsMatch(espnName: string, searchName: string): boolean {
  const espn = espnName.toLowerCase().trim();
  const variants = teamNameVariants(searchName);
  return variants.some((v) => espn.includes(v) || v.includes(espn));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a single NBA game box score by ESPN game ID.
 * Returns null on any error.
 */
export async function getSDVNBABoxScore(gameId: string): Promise<SDVNBABoxScore | null> {
  const cacheKey = `boxscore:${gameId}`;
  const cached = getCached<SDVNBABoxScore>(cacheKey);
  if (cached) return cached;

  try {
    const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    } as RequestInit);
    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const competitions = (data?.header as Record<string, unknown>)?.competitions as Array<Record<string, unknown>>;
    if (!competitions?.length) return null;

    const comp = competitions[0];
    const competitors = comp?.competitors as Array<Record<string, unknown>>;
    if (!competitors?.length) return null;

    const homeComp = competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
    const awayComp = competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];

    const homeTeam = (homeComp?.team as Record<string, unknown>)?.displayName as string ?? '';
    const awayTeam = (awayComp?.team as Record<string, unknown>)?.displayName as string ?? '';
    const homeAbbrev = (homeComp?.team as Record<string, unknown>)?.abbreviation as string ?? '';
    const awayAbbrev = (awayComp?.team as Record<string, unknown>)?.abbreviation as string ?? '';
    const status = (comp?.status as Record<string, unknown>)?.type as Record<string, unknown>;

    const result: SDVNBABoxScore = {
      gameId,
      homeTeam,
      homeTeamAbbrev: homeAbbrev,
      awayTeam,
      awayTeamAbbrev: awayAbbrev,
      quarterScores: parseQuarterScores(homeComp, awayComp),
      status: (status?.name as string) ?? 'unknown',
    };

    setCached(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Fetch all NBA games for a given date (YYYYMMDD format).
 * Returns empty array on any error.
 */
export async function getSDVNBAScoreboard(dateStr: string): Promise<SDVNBAGame[]> {
  const cacheKey = `scoreboard:${dateStr}`;
  const cached = getCached<SDVNBAGame[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}&limit=300`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    } as RequestInit);
    if (!res.ok) return [];

    const data = await res.json() as Record<string, unknown>;
    const events = data?.events as Array<Record<string, unknown>>;
    if (!Array.isArray(events)) return [];

    const games: SDVNBAGame[] = [];

    for (const event of events) {
      const competitions = event?.competitions as Array<Record<string, unknown>>;
      if (!competitions?.length) continue;
      const comp = competitions[0];
      const competitors = comp?.competitors as Array<Record<string, unknown>>;
      if (!competitors?.length) continue;

      const homeComp = competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
      const awayComp = competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];

      const homeTeam = (homeComp?.team as Record<string, unknown>)?.displayName as string ?? '';
      const awayTeam = (awayComp?.team as Record<string, unknown>)?.displayName as string ?? '';
      const homeAbbrev = (homeComp?.team as Record<string, unknown>)?.abbreviation as string ?? '';
      const awayAbbrev = (awayComp?.team as Record<string, unknown>)?.abbreviation as string ?? '';
      const status = (comp?.status as Record<string, unknown>)?.type as Record<string, unknown>;
      const statusName = (status?.name as string) ?? 'unknown';

      const quarterScores = statusName === 'STATUS_FINAL'
        ? parseQuarterScores(homeComp, awayComp) ?? undefined
        : undefined;

      games.push({
        gameId: event?.id as string ?? '',
        homeTeam,
        homeTeamAbbrev: homeAbbrev,
        awayTeam,
        awayTeamAbbrev: awayAbbrev,
        status: statusName,
        date: event?.date as string ?? '',
        quarterScores,
      });
    }

    setCached(cacheKey, games);
    return games;
  } catch {
    return [];
  }
}

/**
 * Convenience: find quarter scores for a specific matchup on a given date.
 * homeTeam / awayTeam can be city name, nickname, or abbreviation (case-insensitive).
 * dateStr: YYYYMMDD format.
 * Returns null if game not found or quarter data unavailable.
 */
export async function getSDVNBAQuarterScores(
  homeTeam: string,
  awayTeam: string,
  dateStr: string
): Promise<SDVQuarterScores | null> {
  try {
    const games = await getSDVNBAScoreboard(dateStr);

    const match = games.find(
      (g) =>
        (teamsMatch(g.homeTeam, homeTeam) || teamsMatch(g.homeTeamAbbrev, homeTeam)) &&
        (teamsMatch(g.awayTeam, awayTeam) || teamsMatch(g.awayTeamAbbrev, awayTeam))
    );

    if (!match) return null;

    // If scoreboard already has quarter scores, use them
    if (match.quarterScores) return match.quarterScores;

    // Otherwise fetch the full box score by game ID
    if (match.gameId) {
      const boxScore = await getSDVNBABoxScore(match.gameId);
      return boxScore?.quarterScores ?? null;
    }

    return null;
  } catch {
    return null;
  }
}
