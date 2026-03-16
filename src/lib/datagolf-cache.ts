/**
 * DataGolf Cache — stores scraped data locally (JSON file).
 * Will migrate to Supabase once validated.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { DGScrapeResult } from "./datagolf-scraper";

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

export function getDGCache(): DGCache | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as DGCache;
  } catch {
    return null;
  }
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
  const cache = getDGCache();
  if (!cache) return true;
  const age = Date.now() - new Date(cache.lastScrape).getTime();
  return age > STALE_MS;
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
