/**
 * betting-splits-store.ts
 * File-based persistence for cross-sport betting-splits snapshots.
 *
 * Snapshot files live at:
 *   data/betting-splits/{YYYY-MM-DD}-{sport}.json
 *
 * Each file is a BettingSplitsPersistedDay containing snapshots from all
 * requested sources (DK primary + FD comparison) for that sport on that date.
 *
 * Pattern mirrors market-snapshot-store.ts: local disk for dev/server,
 * with a lightweight in-memory cache to avoid re-reading within a request cycle.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BettingSplitsBoardResult,
  BettingSplitsSport,
} from "@/lib/betting-splits";

const DATA_DIR = path.join(process.cwd(), "data");
const SPLITS_DIR = path.join(DATA_DIR, "betting-splits");
const STORE_VERSION = 1;

// ── Persisted types ──────────────────────────────────────────────────────────

export type BettingSplitsPersistedDay = {
  /** Schema version */
  version: number;
  sport: BettingSplitsSport;
  gameDate: string;
  /** ISO timestamp of the most recent capture */
  lastCapturedAt: string;
  /** Number of capture passes on this date */
  captureCount: number;
  /** The board result from the most recent capture (includes all sources) */
  board: BettingSplitsBoardResult;
  /** Whether snapshot was successfully persisted to disk */
  persisted: true;
};

export type BettingSplitsCaptureStatus = {
  sport: BettingSplitsSport;
  gameDate: string;
  status: "persisted" | "memory_fallback" | "error";
  capturedAt: string;
  gamesWithSplits: number;
  gamesWithPrimarySource: number;
  gamesOnFallback: number;
  error: string | null;
};

// ── In-memory cache ──────────────────────────────────────────────────────────

const _memCache = new Map<string, BettingSplitsPersistedDay>();

function cacheKey(sport: BettingSplitsSport, gameDate: string): string {
  return `${gameDate}-${sport}`;
}

function snapshotPath(sport: BettingSplitsSport, gameDate: string): string {
  return path.join(SPLITS_DIR, `${gameDate}-${sport}.json`);
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a board result to disk.
 * Creates the data/betting-splits/ directory if it doesn't exist.
 * On write failure, logs the error but still updates the in-memory cache.
 */
export async function saveBettingSplitsSnapshot(
  board: BettingSplitsBoardResult,
): Promise<BettingSplitsCaptureStatus> {
  const { sport, gameDate, snapshotAt } = board;
  const key = cacheKey(sport, gameDate);
  const capturedAt = new Date().toISOString();

  // Read existing file to preserve captureCount
  let captureCount = 1;
  const existing = _memCache.get(key);
  if (existing) captureCount = existing.captureCount + 1;

  const day: BettingSplitsPersistedDay = {
    version: STORE_VERSION,
    sport,
    gameDate,
    lastCapturedAt: snapshotAt,
    captureCount,
    board,
    persisted: true,
  };

  // Always update memory cache
  _memCache.set(key, day);

  // Write to disk
  try {
    await mkdir(SPLITS_DIR, { recursive: true });
    await writeFile(snapshotPath(sport, gameDate), JSON.stringify(day, null, 2), "utf8");
    return {
      sport,
      gameDate,
      status: "persisted",
      capturedAt,
      gamesWithSplits: board.gamesWithSplits,
      gamesWithPrimarySource: board.gamesWithPrimarySource,
      gamesOnFallback: board.gamesOnFallback,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "disk write failed";
    console.warn(`[betting-splits-store] Failed to persist ${sport} ${gameDate}:`, msg);
    return {
      sport,
      gameDate,
      status: "memory_fallback",
      capturedAt,
      gamesWithSplits: board.gamesWithSplits,
      gamesWithPrimarySource: board.gamesWithPrimarySource,
      gamesOnFallback: board.gamesOnFallback,
      error: msg,
    };
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Load a persisted day snapshot from disk (or memory cache).
 * Returns null if no snapshot exists for the requested date.
 */
export async function loadBettingSplitsSnapshot(
  sport: BettingSplitsSport,
  gameDate: string,
): Promise<BettingSplitsPersistedDay | null> {
  const key = cacheKey(sport, gameDate);

  // Try memory first
  if (_memCache.has(key)) return _memCache.get(key)!;

  // Try disk
  try {
    const raw = await readFile(snapshotPath(sport, gameDate), "utf8");
    const parsed = JSON.parse(raw) as BettingSplitsPersistedDay;
    _memCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Load snapshots for all covered sports on a given date.
 * Sports with no persisted snapshot are omitted from the result.
 */
export async function loadBettingSplitsCrossSport(
  gameDate: string,
): Promise<Partial<Record<BettingSplitsSport, BettingSplitsPersistedDay>>> {
  const sports: BettingSplitsSport[] = ["NBA", "NHL", "MLB", "NFL"];
  const results = await Promise.all(
    sports.map(async (sport) => {
      const day = await loadBettingSplitsSnapshot(sport, gameDate);
      return [sport, day] as const;
    }),
  );
  return Object.fromEntries(results.filter(([, v]) => v !== null)) as Partial<
    Record<BettingSplitsSport, BettingSplitsPersistedDay>
  >;
}

/**
 * List all persisted split dates for a sport (reads disk directory).
 */
export async function listBettingSplitsDates(
  sport: BettingSplitsSport,
): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(SPLITS_DIR);
    return files
      .filter((f) => f.endsWith(`-${sport}.json`))
      .map((f) => f.replace(`-${sport}.json`, ""))
      .sort();
  } catch {
    return [];
  }
}
