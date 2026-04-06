/**
 * BallDontLie PGA API Adapter
 * Key: BALLDONTLIE_PGA_KEY
 * Rate limit: 5 req/min on free tier — always use caching, never poll in loops.
 * Docs: https://pga.balldontlie.io/
 *
 * Endpoints available:
 *   players, tournaments, courses, tee-times, tournament-field,
 *   tournament-results, player-round-results, player-round-stats,
 *   player-scorecards, player-season-stats, tournament-course-stats,
 *   futures, player-props
 */

const BDL_BASE = "https://api.balldontlie.io/pga/v1";
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h — respect the 5 req/min limit

type CacheEntry<T> = { data: T; timestamp: number };
const cache = new Map<string, CacheEntry<unknown>>();

function getApiKey(): string | null {
  return process.env.BALLDONTLIE_PGA_KEY ?? null;
}

async function bdlFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const key = getApiKey();
  if (!key) return null;

  const qs = new URLSearchParams({ per_page: "100", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) }).toString();
  const cacheKey = `${path}?${qs}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data as T;
  }

  try {
    const res = await fetch(`${BDL_BASE}/${path}?${qs}`, {
      headers: { Authorization: key },
      next: { revalidate: 14400 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: T };
    cache.set(cacheKey, { data: json.data, timestamp: Date.now() });
    return json.data;
  } catch {
    return null;
  }
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export interface BDLTournament {
  id: number;
  season: number;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  state: string;
  country: string;
  course_name: string;
  purse: string;
  status: "COMPLETED" | "IN_PROGRESS" | "UPCOMING" | string;
  champion?: { id: number; display_name: string } | null;
}

export async function getBDLTournaments(season = 2025): Promise<BDLTournament[]> {
  const data = await bdlFetch<BDLTournament[]>("tournaments", { season });
  return data ?? [];
}

export async function getBDLCurrentTournament(): Promise<BDLTournament | null> {
  const tournaments = await getBDLTournaments(2025);
  return (
    tournaments.find((t) => t.status === "IN_PROGRESS") ??
    tournaments.find((t) => t.status === "UPCOMING") ??
    tournaments.filter((t) => t.status === "COMPLETED").at(-1) ??
    null
  );
}

// ─── Player Round Stats ───────────────────────────────────────────────────────

export interface BDLRoundStat {
  id: number;
  player: { id: number; display_name: string };
  tournament: { id: number; name: string };
  round: number;
  score: number;
  strokes: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  double_bogeys: number;
  other: number;
  position: number | null;
}

export async function getBDLRoundStats(tournamentId: number, round?: number): Promise<BDLRoundStat[]> {
  const params: Record<string, string | number> = { tournament_id: tournamentId };
  if (round) params.round = round;
  const data = await bdlFetch<BDLRoundStat[]>("player-round-stats", params);
  return data ?? [];
}

// ─── Season Stats ─────────────────────────────────────────────────────────────

export interface BDLSeasonStat {
  id: number;
  player: { id: number; display_name: string };
  season: number;
  events: number;
  cuts_made: number;
  wins: number;
  top_10s: number;
  scoring_avg: number;
  driving_distance: number;
  driving_accuracy: number;
  gir_percentage: number;
  putts_per_round: number;
  scrambling: number;
  money: number;
  fedex_points: number;
}

export async function getBDLSeasonStats(season = 2025): Promise<BDLSeasonStat[]> {
  const data = await bdlFetch<BDLSeasonStat[]>("player-season-stats", { season });
  return data ?? [];
}

// ─── Futures / Odds ───────────────────────────────────────────────────────────

export interface BDLFuturesOdds {
  player: { id: number; display_name: string };
  tournament: { id: number; name: string };
  book: string;
  market_type: string;
  odds: number;
  updated_at: string;
}

export async function getBDLFutures(tournamentId: number): Promise<BDLFuturesOdds[]> {
  const data = await bdlFetch<BDLFuturesOdds[]>("futures", { tournament_id: tournamentId });
  return data ?? [];
}

// ─── Tournament Results ───────────────────────────────────────────────────────

export interface BDLTournamentResult {
  player: { id: number; display_name: string };
  tournament: { id: number; name: string };
  position: number;
  score: number;
  total_strokes: number;
  earnings: number | null;
  fedex_points: number | null;
}

export async function getBDLTournamentResults(tournamentId: number): Promise<BDLTournamentResult[]> {
  const data = await bdlFetch<BDLTournamentResult[]>("tournament-results", { tournament_id: tournamentId });
  return data ?? [];
}

// ─── Tee Times ────────────────────────────────────────────────────────────────

export interface BDLTeeTime {
  player: { id: number; display_name: string };
  tournament: { id: number; name: string };
  round: number;
  tee_time: string;
  course: string;
  hole: number;
  group: string | null;
}

export async function getBDLTeeTimes(tournamentId: number, round?: number): Promise<BDLTeeTime[]> {
  const params: Record<string, string | number> = { tournament_id: tournamentId };
  if (round) params.round = round;
  const data = await bdlFetch<BDLTeeTime[]>("tee-times", params);
  return data ?? [];
}
