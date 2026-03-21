/**
 * DataGolf Cache — stores scraped data in Supabase with /tmp as a local fallback.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { DGScrapeResult } from "./datagolf-scraper";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "./supabase-shared";
import type { GolfDGCacheSummary } from "./types";

const CACHE_PATH = "/tmp/datagolf-cache.json";
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

type DGCacheRow = {
  id: string;
  tournament: string;
  data: unknown;
  last_scrape: string;
  created_at: string;
};

export interface DGCache {
  lastScrape: string;
  tournament: string;
  data: DGScrapeResult;
  scrapeHistory: Array<{
    date: string;
    tournament: string;
    rankingsCount: number;
    predictionsCount: number;
    courseFitCount: number;
    fieldCount: number;
    errors: string[];
  }>;
}

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return null as T;
    return await response.json() as T;
  }

  let message = `Supabase request failed (${response.status})`;

  try {
    const payload = await response.json() as { message?: string; error?: string; details?: string };
    message = payload.message || payload.error || payload.details || message;
  } catch {
    // ignore malformed payloads
  }

  throw new Error(message);
}

async function postgrest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

function normalizeName(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasPopulatedDGData(data?: DGScrapeResult | null) {
  if (!data) return false;
  return data.rankings.length > 0
    || data.predictions.length > 0
    || data.courseFit.length > 0
    || data.field.length > 0;
}

function hasUsableDGModelData(data?: DGScrapeResult | null) {
  if (!data) return false;
  return data.rankings.length > 0
    || data.predictions.length > 0
    || data.courseFit.length > 0;
}

function hasKnownTournamentName(tournament?: string | null) {
  const normalized = normalizeName(tournament);
  return Boolean(normalized && normalized !== "unknown");
}

function normalizeTournamentName(value?: string | null) {
  return normalizeName(value)
    .replace(/\b(the|championship|tournament|classic|open|invitational|presented|cup|memorial|world|tour|at|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tournamentsMatch(cacheTournament?: string | null, requestedTournament?: string | null) {
  const left = normalizeTournamentName(cacheTournament);
  const right = normalizeTournamentName(requestedTournament);

  if (!left || !right) return true;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftTokens = left.split(" ").filter((token) => token.length > 2);
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (leftTokens.length === 0 || rightTokens.size === 0) return false;

  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  return overlap >= Math.max(1, Math.ceil(Math.min(leftTokens.length, rightTokens.size) * 0.5));
}

function buildReason(params: {
  available: boolean;
  populated: boolean;
  knownTournament: boolean;
  usableModelData: boolean;
  fresh: boolean;
  ready: boolean;
  tournamentMatch: boolean;
  matchedPlayers: number;
  totalPlayers: number;
}) {
  if (!params.available) return "No DataGolf cache found.";
  if (!params.populated) return "Latest DataGolf scrape returned no rows, so a re-scrape is still needed.";
  if (!params.knownTournament) return "Latest DataGolf scrape did not resolve a tournament name, so the cache is not usable.";
  if (!params.usableModelData) return "Latest DataGolf scrape only has field/update rows; rankings, predictions, or course-fit data are still missing.";
  if (!params.fresh) return "Using a stale DataGolf cache because no fresher scrape is available yet.";
  if (!params.tournamentMatch) return "The cached DataGolf tournament does not match the current PGA event.";
  if (params.totalPlayers > 0 && !params.ready) {
    if (params.matchedPlayers === 0) {
      return "The cached DataGolf player pool does not match the current PGA field yet.";
    }
    return `The cached DataGolf data only matched ${params.matchedPlayers} of ${params.totalPlayers} field players.`;
  }
  if (params.totalPlayers > 0) {
    return `DataGolf cache matched ${params.matchedPlayers} of ${params.totalPlayers} current field players.`;
  }
  return "Fresh DataGolf cache is available.";
}

function readTmpCache(): DGCache | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return normalizeCachePayload(JSON.parse(raw), null, null);
  } catch {
    return null;
  }
}

function writeTmpCache(cache: DGCache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

function normalizeScrapeHistory(value: unknown): DGCache["scrapeHistory"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isObject)
    .map((entry) => ({
      date: typeof entry.date === "string" ? entry.date : new Date().toISOString(),
      tournament: typeof entry.tournament === "string" ? entry.tournament : "Unknown",
      rankingsCount: typeof entry.rankingsCount === "number" ? entry.rankingsCount : 0,
      predictionsCount: typeof entry.predictionsCount === "number" ? entry.predictionsCount : 0,
      courseFitCount: typeof entry.courseFitCount === "number" ? entry.courseFitCount : 0,
      fieldCount: typeof entry.fieldCount === "number" ? entry.fieldCount : 0,
      errors: Array.isArray(entry.errors)
        ? entry.errors.filter((error): error is string => typeof error === "string")
        : [],
    }));
}

function normalizeScrapeResult(value: unknown, fallbackTournament?: string | null, fallbackLastScrape?: string | null): DGScrapeResult | null {
  if (!isObject(value)) return null;

  return {
    timestamp: typeof value.timestamp === "string"
      ? value.timestamp
      : (fallbackLastScrape ?? new Date().toISOString()),
    tournament: typeof value.tournament === "string"
      ? value.tournament
      : (fallbackTournament ?? "Unknown"),
    venue: isObject(value.venue) && typeof (value.venue as Record<string, unknown>).courseName === "string"
      ? value.venue as unknown as DGScrapeResult["venue"]
      : null,
    rankings: Array.isArray(value.rankings) ? value.rankings as DGScrapeResult["rankings"] : [],
    predictions: Array.isArray(value.predictions) ? value.predictions as DGScrapeResult["predictions"] : [],
    courseFit: Array.isArray(value.courseFit) ? value.courseFit as DGScrapeResult["courseFit"] : [],
    field: Array.isArray(value.field) ? value.field as DGScrapeResult["field"] : [],
    errors: Array.isArray(value.errors)
      ? value.errors.filter((error): error is string => typeof error === "string")
      : [],
  };
}

function normalizeCachePayload(
  value: unknown,
  fallbackTournament?: string | null,
  fallbackLastScrape?: string | null,
): DGCache | null {
  if (!isObject(value)) return null;

  const maybeNestedData = isObject(value.data) ? value.data : value;
  const data = normalizeScrapeResult(maybeNestedData, fallbackTournament, fallbackLastScrape);
  if (!data) return null;

  const tournament = typeof value.tournament === "string"
    ? value.tournament
    : (fallbackTournament ?? data.tournament);
  const lastScrape = typeof value.lastScrape === "string"
    ? value.lastScrape
    : (fallbackLastScrape ?? data.timestamp);

  return {
    lastScrape,
    tournament,
    data: {
      ...data,
      timestamp: data.timestamp || lastScrape,
      tournament: data.tournament || tournament,
    },
    scrapeHistory: normalizeScrapeHistory(value.scrapeHistory),
  };
}

function buildHistoryEntry(data: DGScrapeResult): DGCache["scrapeHistory"][number] {
  return {
    date: data.timestamp,
    tournament: data.tournament,
    rankingsCount: data.rankings.length,
    predictionsCount: data.predictions.length,
    courseFitCount: data.courseFit.length,
    fieldCount: data.field.length,
    errors: data.errors,
  };
}

async function readSupabaseCache(): Promise<DGCache | null> {
  const rows = await postgrest<DGCacheRow[]>(
    "/rest/v1/datagolf_cache?select=*&order=last_scrape.desc.nullslast&limit=1",
  );

  const row = rows[0];
  if (!row) return null;

  const cache = normalizeCachePayload(row.data, row.tournament, row.last_scrape);
  if (!cache) return null;

  try {
    writeTmpCache(cache);
  } catch (error) {
    console.error("[DG Cache] Failed to refresh /tmp fallback:", toErrorMessage(error));
  }

  return cache;
}

async function writeSupabaseCache(cache: DGCache): Promise<void> {
  await postgrest(
    "/rest/v1/datagolf_cache?on_conflict=tournament",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        tournament: cache.tournament,
        data: cache,
        last_scrape: cache.lastScrape,
      }),
    },
  );
}

export async function getDGCache(): Promise<DGCache | null> {
  try {
    const cache = await readSupabaseCache();
    if (cache) return cache;
  } catch (error) {
    console.error("[DG Cache] Supabase read failed:", toErrorMessage(error));
  }

  return readTmpCache();
}

/** Get venue info (course name + location) from DG cache if available */
export async function getDGVenueInfo(): Promise<{ courseName: string; location: string } | null> {
  const cache = await getDGCache();
  return cache?.data?.venue ?? null;
}

export function summarizeDGCache(params?: {
  tournamentName?: string;
  playerNames?: string[];
  cache?: DGCache | null;
}): GolfDGCacheSummary {
  const cache = params?.cache ?? null;
  const data = cache?.data;
  const available = Boolean(cache);
  const populated = hasPopulatedDGData(data);
  const usableModelData = hasUsableDGModelData(data);
  const knownTournament = hasKnownTournamentName(cache?.tournament);
  const lastScrape = cache?.lastScrape ?? null;
  const age = lastScrape ? Date.now() - new Date(lastScrape).getTime() : Number.POSITIVE_INFINITY;
  const fresh = populated && Number.isFinite(age) && age <= STALE_MS;
  const tournamentMatch = tournamentsMatch(cache?.tournament, params?.tournamentName);

  const playerNames = (params?.playerNames ?? []).filter(Boolean);
  const normalizedField = new Set(
    [
      ...(data?.rankings ?? []).map((entry) => entry.name),
      ...(data?.predictions ?? []).map((entry) => entry.name),
      ...(data?.courseFit ?? []).map((entry) => entry.name),
      ...(data?.field ?? []).map((entry) => entry.name),
    ].map(normalizeName).filter(Boolean),
  );

  const matchedPlayers = playerNames.reduce((count, name) => (
    normalizedField.has(normalizeName(name)) ? count + 1 : count
  ), 0);
  const totalPlayers = playerNames.length;
  const requiredMatches = totalPlayers > 0
    ? Math.min(totalPlayers, Math.min(8, Math.max(3, Math.ceil(totalPlayers * 0.2))))
    : 0;
  const sufficientFieldCoverage = totalPlayers === 0 || matchedPlayers >= requiredMatches;
  const ready = populated && usableModelData && knownTournament && fresh && tournamentMatch && sufficientFieldCoverage;

  return {
    available,
    populated,
    fresh,
    ready,
    lastScrape,
    tournament: cache?.tournament ?? null,
    rankingsCount: data?.rankings.length ?? 0,
    predictionsCount: data?.predictions.length ?? 0,
    courseFitCount: data?.courseFit.length ?? 0,
    fieldCount: data?.field.length ?? 0,
    matchedPlayers,
    totalPlayers,
    reason: buildReason({
      available,
      populated,
      knownTournament,
      usableModelData,
      fresh,
      ready,
      tournamentMatch,
      matchedPlayers,
      totalPlayers,
    }),
  };
}

export async function getDGCacheSummary(params?: {
  tournamentName?: string;
  playerNames?: string[];
  cache?: DGCache | null;
}): Promise<GolfDGCacheSummary> {
  const cache = params?.cache ?? await getDGCache();
  return summarizeDGCache({
    ...params,
    cache,
  });
}

export async function setDGCache(data: DGScrapeResult): Promise<void> {
  const existing = await getDGCache();
  const cache: DGCache = {
    lastScrape: data.timestamp,
    tournament: data.tournament,
    data,
    scrapeHistory: [...(existing?.scrapeHistory || []), buildHistoryEntry(data)].slice(-30),
  };

  try {
    writeTmpCache(cache);
  } catch (error) {
    console.error("[DG Cache] Failed to write /tmp fallback:", toErrorMessage(error));
  }

  await writeSupabaseCache(cache);
}

export async function isDGCacheStale(): Promise<boolean> {
  const summary = await getDGCacheSummary();
  return !summary.ready;
}

function analyzeScrapeHistory(cache: DGCache | null): {
  recommendation: string;
  analysis: Record<string, number>;
} | null {
  if (!cache || cache.scrapeHistory.length < 10) return null;

  const dayScores: Record<string, number[]> = {};

  for (let i = 1; i < cache.scrapeHistory.length; i++) {
    const prev = cache.scrapeHistory[i - 1];
    const curr = cache.scrapeHistory[i];

    const day = new Date(curr.date).toLocaleDateString("en-US", { weekday: "long" });
    const changeScore
      = Math.abs(curr.predictionsCount - prev.predictionsCount)
      + Math.abs(curr.courseFitCount - prev.courseFitCount)
      + (curr.tournament !== prev.tournament ? 10 : 0);

    dayScores[day] = dayScores[day] || [];
    dayScores[day].push(changeScore);
  }

  const analysis = Object.fromEntries(
    Object.entries(dayScores).map(([day, scores]) => [
      day,
      scores.reduce((sum, score) => sum + score, 0) / scores.length,
    ]),
  );

  const sorted = Object.entries(analysis)
    .sort(([, left], [, right]) => right - left);

  if (sorted.length === 0) return null;

  return {
    recommendation: sorted[0][0],
    analysis,
  };
}

/**
 * Analyze scrape history to determine optimal scrape day.
 * Call after 2+ tournaments of daily scraping.
 * Returns the day of week with most data changes (predictions updating).
 */
export async function analyzeBestScrapeDay(): Promise<{
  recommendation: string;
  analysis: Record<string, number>;
} | null> {
  return analyzeScrapeHistory(await getDGCache());
}
