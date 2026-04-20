import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AggregatedOdds } from "@/lib/books/types";
import type { MarketSnapshotEventRecord, MarketSnapshotPriceRecord, MarketSnapshotRecord } from "@/lib/market-snapshot-store";

const SNAPSHOT_DIR = path.join(process.cwd(), "data", "market-snapshots");

type DailyMarketSnapshotFile = {
  date: string;
  snapshots: MarketSnapshotRecord[];
};

export type MarketHistoryDelta = {
  book: string;
  marketType: "moneyline" | "spread" | "total";
  outcome: string;
  openingOdds: number | null;
  latestOdds: number | null;
  openingLine: number | null;
  latestLine: number | null;
  oddsDelta: number | null;
  lineDelta: number | null;
};

export type MarketHistoryRail = {
  gameId: string;
  capturedSnapshots: number;
  openingCapturedAt: string;
  latestCapturedAt: string;
  archiveStartedAt: string;
  freshnessNote: string;
  limitationNote: string;
  staleSourceCount: number;
  booksTracked: string[];
  deltas: MarketHistoryDelta[];
  source: "filesystem" | "supabase";
};

function getDateKey(iso: string) {
  return iso.slice(0, 10);
}

async function readDailySnapshotsFromFilesystem(dateKey: string): Promise<MarketSnapshotRecord[]> {
  try {
    const raw = await readFile(path.join(SNAPSHOT_DIR, `${dateKey}.json`), "utf8");
    const parsed = JSON.parse(raw) as Partial<DailyMarketSnapshotFile> | null;
    return Array.isArray(parsed?.snapshots) ? parsed!.snapshots as MarketSnapshotRecord[] : [];
  } catch {
    return [];
  }
}

/**
 * Minimal snapshot stub — only the fields used by findEvent() and buildDeltaRecord().
 * Avoids reconstructing full MarketSnapshotRecord blobs from Supabase price rows.
 */
type SnapshotStub = {
  capturedAt: string;
  events: Pick<MarketSnapshotEventRecord, "gameId">[];
  prices: MarketSnapshotPriceRecord[];
};

/**
 * Read daily snapshots from Supabase market_snapshot_prices / market_snapshots.
 * Returns minimal stubs grouped by snapshot_id, sorted by captured_at asc.
 * Falls through to [] on any error so callers treat this as a graceful no-data path.
 */
async function readDailySnapshotsFromSupabase(dateKey: string, gameId: string): Promise<SnapshotStub[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const base = url.replace(/\/+$/, "");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    // Step 1: get all snapshot IDs for this date key, ordered by capture time.
    const snapshotRes = await fetch(
      `${base}/rest/v1/market_snapshots?date_key=eq.${encodeURIComponent(dateKey)}&select=id,captured_at&order=captured_at.asc`,
      { headers, cache: "no-store" },
    );
    if (!snapshotRes.ok) return [];

    const snapshotRows = await snapshotRes.json() as Array<{ id: string; captured_at: string }>;
    if (snapshotRows.length < 2) return [];

    // Step 2: fetch all price rows for this game across today's snapshots.
    // Use `in` filter on snapshot_ids.
    const snapshotIdList = snapshotRows.map((r) => r.id).join(",");
    const priceRes = await fetch(
      `${base}/rest/v1/market_snapshot_prices?game_id=eq.${encodeURIComponent(gameId)}&snapshot_id=in.(${encodeURIComponent(snapshotIdList)})&select=*&order=captured_at.asc&limit=2000`,
      { headers, cache: "no-store" },
    );
    if (!priceRes.ok) return [];

    const priceRows = await priceRes.json() as Array<{
      id: string;
      snapshot_id: string;
      event_snapshot_id: string;
      sport: string;
      game_id: string;
      odds_api_event_id: string | null;
      commence_time: string | null;
      captured_at: string;
      book: string;
      market_type: string;
      outcome: string;
      odds: number;
      line: number | null;
      source: string;
      source_updated_at: string | null;
      source_age_minutes: number | null;
    }>;

    if (priceRows.length === 0) return [];

    // Step 3: group price rows by snapshot_id into stubs.
    const stubMap = new Map<string, SnapshotStub>();

    for (const row of priceRows) {
      const snapshotMeta = snapshotRows.find((s) => s.id === row.snapshot_id);
      const capturedAt = snapshotMeta?.captured_at ?? row.captured_at;

      let stub = stubMap.get(row.snapshot_id);
      if (!stub) {
        stub = {
          capturedAt,
          events: [{ gameId: row.game_id }],
          prices: [],
        };
        stubMap.set(row.snapshot_id, stub);
      }

      // Validate market_type is one of the expected values before casting.
      const marketType = (["moneyline", "spread", "spread_q1", "spread_q3", "total"] as const).find(
        (m) => m === row.market_type,
      );
      if (!marketType) continue;

      const participantKey = `${marketType}:${String(row.outcome ?? "").toLowerCase()}:${row.line ?? "na"}`;
      const canonicalGameId = `cg:${String(row.sport || "unknown").toLowerCase()}:${String(row.game_id || "unknown")}`;
      stub.prices.push({
        id: row.id,
        snapshotId: row.snapshot_id,
        eventSnapshotId: row.event_snapshot_id,
        sport: row.sport as MarketSnapshotPriceRecord["sport"],
        gameId: row.game_id,
        canonicalGameId,
        canonicalMarketKey: `${canonicalGameId}:${String(row.book || "unknown").toLowerCase()}:${participantKey}`,
        participantKey,
        oddsApiEventId: row.odds_api_event_id,
        commenceTime: row.commence_time,
        capturedAt: row.captured_at,
        book: row.book,
        marketType,
        outcome: row.outcome,
        odds: typeof row.odds === "string" ? parseFloat(row.odds) : row.odds,
        line: row.line !== null && row.line !== undefined ? (typeof row.line === "string" ? parseFloat(row.line) : row.line) : null,
        source: row.source,
        sourceUpdatedAt: row.source_updated_at,
        sourceAgeMinutes: row.source_age_minutes,
        captureWindowPhase: "pregame",
        isOpeningCandidate: true,
        isClosingCandidate: false,
        coverageFlags: {},
        sourceLimited: false,
      });
    }

    // Sort stubs by capturedAt and return as array.
    return Array.from(stubMap.values()).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  } catch (err) {
    console.warn("[market-snapshot-history] Supabase fallback error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

function findEvent(snapshot: Pick<MarketSnapshotRecord, "events"> | SnapshotStub, gameId: string): boolean {
  return snapshot.events.some((event) => event.gameId === gameId);
}

function buildDeltaRecord(
  opening: Pick<MarketSnapshotRecord, "prices"> | SnapshotStub,
  latest: Pick<MarketSnapshotRecord, "prices"> | SnapshotStub,
  gameId: string,
): MarketHistoryDelta[] {
  const openingPrices = opening.prices.filter((price) => price.gameId === gameId);
  const latestPrices = latest.prices.filter((price) => price.gameId === gameId);
  const latestByKey = new Map(latestPrices.map((price) => [`${price.book}:${price.marketType}:${price.outcome}`, price]));
  const deltas: MarketHistoryDelta[] = [];

  for (const openingPrice of openingPrices) {
    const latestPrice = latestByKey.get(`${openingPrice.book}:${openingPrice.marketType}:${openingPrice.outcome}`);
    if (!latestPrice) continue;

    const marketType = openingPrice.marketType === "spread" || openingPrice.marketType === "total" || openingPrice.marketType === "moneyline"
      ? openingPrice.marketType
      : null;
    if (!marketType) continue;

    deltas.push({
      book: openingPrice.book,
      marketType,
      outcome: openingPrice.outcome,
      openingOdds: openingPrice.odds,
      latestOdds: latestPrice.odds,
      openingLine: openingPrice.line,
      latestLine: latestPrice.line,
      oddsDelta: latestPrice.odds - openingPrice.odds,
      lineDelta: typeof latestPrice.line === "number" && typeof openingPrice.line === "number"
        ? latestPrice.line - openingPrice.line
        : null,
    });
  }

  return deltas;
}

export async function getMarketHistoryRail(game: AggregatedOdds): Promise<MarketHistoryRail | null> {
  const dateKey = getDateKey(game.commenceTime || new Date().toISOString());

  // ── Primary: filesystem (fast, works locally) ──────────────────────────
  const fsSnapshots = await readDailySnapshotsFromFilesystem(dateKey);
  const fsMatching = fsSnapshots.filter((snapshot) => findEvent(snapshot, game.gameId)).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  if (fsMatching.length >= 2) {
    const opening = fsMatching[0];
    const latest = fsMatching[fsMatching.length - 1];
    const latestEvent = latest.events.find((e) => e.gameId === game.gameId);
    const staleSourceCount = (latestEvent as MarketSnapshotEventRecord | undefined)?.freshness?.staleSourceCount ?? 0;
    const deltas = buildDeltaRecord(opening, latest, game.gameId)
      .sort((a, b) => {
        const aMagnitude = Math.max(Math.abs(a.oddsDelta ?? 0), Math.abs(a.lineDelta ?? 0));
        const bMagnitude = Math.max(Math.abs(b.oddsDelta ?? 0), Math.abs(b.lineDelta ?? 0));
        return bMagnitude - aMagnitude;
      })
      .slice(0, 6);
    const booksTracked = Array.from(new Set(deltas.map((delta) => delta.book))).sort((a, b) => a.localeCompare(b));

    return {
      gameId: game.gameId,
      capturedSnapshots: fsMatching.length,
      openingCapturedAt: opening.capturedAt,
      latestCapturedAt: latest.capturedAt,
      archiveStartedAt: opening.capturedAt,
      freshnessNote: staleSourceCount
        ? `${staleSourceCount} latest source entr${staleSourceCount === 1 ? "y is" : "ies are"} older than 30 minutes.`
        : "Latest snapshot inputs are within the normal freshness window.",
      limitationNote: fsMatching.length < 4
        ? "Snapshot archive is still shallow today, so treat this as opening-vs-latest context, not a full intraday chart."
        : "Snapshot archive is still same-day only here; this rail shows opening-to-latest context, not a long-term warehouse.",
      staleSourceCount,
      booksTracked,
      deltas,
      source: "filesystem",
    };
  }

  // ── Fallback: Supabase (deployed env / read-only filesystem) ──────────
  const supabaseStubs = await readDailySnapshotsFromSupabase(dateKey, game.gameId);
  const sbMatching = supabaseStubs.filter((stub) => findEvent(stub, game.gameId));

  if (sbMatching.length < 2) return null;

  const opening = sbMatching[0];
  const latest = sbMatching[sbMatching.length - 1];
  const deltas = buildDeltaRecord(opening, latest, game.gameId)
    .sort((a, b) => {
      const aMagnitude = Math.max(Math.abs(a.oddsDelta ?? 0), Math.abs(a.lineDelta ?? 0));
      const bMagnitude = Math.max(Math.abs(b.oddsDelta ?? 0), Math.abs(b.lineDelta ?? 0));
      return bMagnitude - aMagnitude;
    })
    .slice(0, 6);
  const booksTracked = Array.from(new Set(deltas.map((delta) => delta.book))).sort((a, b) => a.localeCompare(b));

  return {
    gameId: game.gameId,
    capturedSnapshots: sbMatching.length,
    openingCapturedAt: opening.capturedAt,
    latestCapturedAt: latest.capturedAt,
    archiveStartedAt: opening.capturedAt,
    freshnessNote: "Snapshot history sourced from Supabase. Live hourly market_snapshot_prices used.",
    limitationNote: sbMatching.length < 4
      ? "Supabase snapshot archive is shallow today — treat this as opening-vs-latest context, not a full intraday chart."
      : "Supabase snapshot archive live. Shows opening-to-latest context for today's games.",
    staleSourceCount: 0,
    booksTracked,
    deltas,
    source: "supabase",
  };
}
