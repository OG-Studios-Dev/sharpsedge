/**
 * DataGolf Cache — stores scraped data locally (JSON file).
 * Will migrate to Supabase once validated.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { DGScrapeResult } from "./datagolf-scraper";
import type { GolfDGCacheSummary } from "./types";

const CACHE_PATH = "/tmp/datagolf-cache.json";
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

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

function normalizeName(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  if (!params.available) return "No local DataGolf cache found.";
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

export function getDGCache(): DGCache | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as DGCache;
  } catch {
    return null;
  }
}

export function getDGCacheSummary(params?: {
  tournamentName?: string;
  playerNames?: string[];
  cache?: DGCache | null;
}): GolfDGCacheSummary {
  const cache = params?.cache ?? getDGCache();
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

export function setDGCache(data: DGScrapeResult): void {
  const existing = getDGCache();
  const historyEntry = {
    date: data.timestamp,
    tournament: data.tournament,
    rankingsCount: data.rankings.length,
    predictionsCount: data.predictions.length,
    courseFitCount: data.courseFit.length,
    fieldCount: data.field.length,
    errors: data.errors,
  };

  const cache: DGCache = {
    lastScrape: data.timestamp,
    tournament: data.tournament,
    data,
    scrapeHistory: [...(existing?.scrapeHistory || []), historyEntry].slice(-30), // keep last 30
  };

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export function isDGCacheStale(): boolean {
  const summary = getDGCacheSummary();
  return !summary.ready;
}

/**
 * Analyze scrape history to determine optimal scrape day.
 * Call after 2+ tournaments of daily scraping.
 * Returns the day of week with most data changes (predictions updating).
 */
export function analyzeBestScrapeDay(): {
  recommendation: string;
  analysis: Record<string, number>;
} | null {
  const cache = getDGCache();
  if (!cache || cache.scrapeHistory.length < 10) return null;

  const dayScores: Record<string, number[]> = {};

  for (let i = 1; i < cache.scrapeHistory.length; i++) {
    const curr = cache.scrapeHistory[i];
    const prev = cache.scrapeHistory[i - 1];
    const dayName = new Date(curr.date).toLocaleDateString("en-US", { weekday: "long" });

    // Score = how much data changed from previous scrape
    const delta =
      Math.abs(curr.predictionsCount - prev.predictionsCount) +
      Math.abs(curr.fieldCount - prev.fieldCount) +
      Math.abs(curr.courseFitCount - prev.courseFitCount);

    if (!dayScores[dayName]) dayScores[dayName] = [];
    dayScores[dayName].push(delta);
  }

  const avgScores: Record<string, number> = {};
  let bestDay = "";
  let bestScore = 0;

  for (const [day, scores] of Object.entries(dayScores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    avgScores[day] = Math.round(avg * 10) / 10;
    if (avg > bestScore) {
      bestScore = avg;
      bestDay = day;
    }
  }

  return {
    recommendation: bestDay || "Tuesday",
    analysis: avgScores,
  };
}
