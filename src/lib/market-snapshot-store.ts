import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AggregatedBookOdds, AggregatedOdds, AggregatedSport } from "@/lib/books/types";
import { bootstrapGoose2ShadowFromSnapshot } from "@/lib/goose2/shadow-pipeline";
import { capturePlayerPropSnapshotRows } from "@/lib/player-prop-snapshot";

const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOT_DIR = path.join(DATA_DIR, "market-snapshots");
const SOURCE_NAME = "aggregated_odds_board";
const STORAGE_VERSION = 1;

const inMemoryDailySnapshots = new Map<string, DailyMarketSnapshotFile>();

export type MarketSnapshotTrigger = "manual" | "cron" | "api";
export type MarketSnapshotWriteStatus = "persisted" | "memory_fallback" | "skipped" | "error";
export type MarketPriceMarketType = "moneyline" | "spread" | "spread_q1" | "spread_q3" | "total" | "first_five_moneyline" | "first_five_total" | "player_prop_points" | "player_prop_rebounds" | "player_prop_assists" | "player_prop_shots_on_goal" | "player_prop_goals" | "player_prop_hits" | "player_prop_total_bases" | "player_prop_strikeouts";

export type SourceFreshnessSummary = {
  sourceCount: number;
  staleSourceCount: number;
  oldestSourceUpdatedAt: string | null;
  newestSourceUpdatedAt: string | null;
  minSourceAgeMinutes: number | null;
  maxSourceAgeMinutes: number | null;
};

export type MarketSnapshotSourceSummary = {
  source: string;
  bookCount: number;
  books: string[];
};

export type MarketSnapshotPriceRecord = {
  id: string;
  snapshotId: string;
  eventSnapshotId: string;
  sport: AggregatedSport;
  gameId: string;
  oddsApiEventId: string | null;
  commenceTime: string | null;
  capturedAt: string;
  book: string;
  marketType: MarketPriceMarketType;
  outcome: string;
  odds: number;
  line: number | null;
  source: string;
  sourceUpdatedAt: string | null;
  sourceAgeMinutes: number | null;
  participantType?: "team" | "player" | "golfer" | "pairing" | "field" | "unknown" | null;
  participantId?: string | null;
  participantName?: string | null;
  opponentName?: string | null;
  propType?: string | null;
  propMarketKey?: string | null;
  context?: Record<string, unknown>;
};

export type MarketSnapshotEventRecord = {
  id: string;
  snapshotId: string;
  sport: AggregatedSport;
  gameId: string;
  oddsApiEventId: string | null;
  commenceTime: string | null;
  matchup: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string;
  awayAbbrev: string;
  capturedAt: string;
  source: string;
  sourceSummary: MarketSnapshotSourceSummary;
  freshness: SourceFreshnessSummary;
  bookCount: number;
  priceCount: number;
  bestPrices: {
    bestHome: AggregatedOdds["bestHome"];
    bestAway: AggregatedOdds["bestAway"];
    bestHomeSpread: AggregatedOdds["bestHomeSpread"];
    bestAwaySpread: AggregatedOdds["bestAwaySpread"];
    bestHomeFirstQuarterSpread: AggregatedOdds["bestHomeFirstQuarterSpread"];
    bestAwayFirstQuarterSpread: AggregatedOdds["bestAwayFirstQuarterSpread"];
    bestHomeThirdQuarterSpread: AggregatedOdds["bestHomeThirdQuarterSpread"];
    bestAwayThirdQuarterSpread: AggregatedOdds["bestAwayThirdQuarterSpread"];
    bestOver: AggregatedOdds["bestOver"];
    bestUnder: AggregatedOdds["bestUnder"];
  };
};

export type MarketSnapshotRecord = {
  id: string;
  capturedAt: string;
  dateKey: string;
  health: {
    status: "healthy" | "stale" | "degraded" | "missing";
    cadenceMinutes: number | null;
    expectedCadenceMinutes: number;
    summary: string;
  };
  source: string;
  trigger: MarketSnapshotTrigger;
  reason: string | null;
  storageVersion: number;
  sportCount: number;
  gameCount: number;
  eventCount: number;
  priceCount: number;
  sourceSummary: MarketSnapshotSourceSummary;
  freshness: SourceFreshnessSummary;
  sportBreakdown: Record<string, {
    gameCount: number;
    bookCount: number;
    priceCount: number;
    sourceSummary: MarketSnapshotSourceSummary;
    freshness: SourceFreshnessSummary;
  }>;
  quarterCoverage: QuarterCoverageSummary;
  events: MarketSnapshotEventRecord[];
  prices: MarketSnapshotPriceRecord[];
};

export type QuarterCoverageSummary = {
  q1PriceCount: number;
  q3PriceCount: number;
  q1GameCount: number;
  q3GameCount: number;
  booksWithQ1: string[];
  booksWithQ3: string[];
};

export type MarketSnapshotCaptureResult = {
  snapshot: MarketSnapshotRecord;
  quarterCoverage: QuarterCoverageSummary;
  persistence: {
    file: {
      status: MarketSnapshotWriteStatus;
      path: string;
    };
    supabase: {
      status: MarketSnapshotWriteStatus;
      error?: string;
    };
    goose2Shadow?: {
      status: MarketSnapshotWriteStatus;
      counts?: {
        snapshot_events: number;
        snapshot_prices: number;
        goose_events: number;
        goose_candidates: number;
        goose_feature_rows: number;
        goose_decision_logs: number;
      };
      error?: string;
    };
  };
};

type DailyMarketSnapshotFile = {
  date: string;
  snapshots: MarketSnapshotRecord[];
};

type CaptureOptions = {
  board: Partial<Record<AggregatedSport, AggregatedOdds[]>>;
  capturedAt?: string;
  trigger?: MarketSnapshotTrigger;
  reason?: string | null;
};

type SourceAge = {
  updatedAt: string;
  ageMinutes: number | null;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function getDateKey(iso: string) {
  return iso.slice(0, 10);
}

function getSnapshotFilePath(date: string) {
  return path.join(SNAPSHOT_DIR, `${date}.json`);
}

function deriveSnapshotHealth(capturedAt: string, dateSnapshots: MarketSnapshotRecord[]) {
  const expectedCadenceMinutes = 60;
  const prior = [...dateSnapshots]
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
    .filter((entry) => entry.capturedAt < capturedAt)
    .pop() || null;
  const cadenceMinutes = prior ? toAgeMinutes(prior.capturedAt, capturedAt) : null;
  const freshnessStale = dateSnapshots.length > 0 && dateSnapshots[dateSnapshots.length - 1]?.freshness?.staleSourceCount > 0;
  const status = !prior
    ? "healthy"
    : cadenceMinutes != null && cadenceMinutes > expectedCadenceMinutes * 2
      ? "stale"
      : freshnessStale
        ? "degraded"
        : "healthy";
  const summary = !prior
    ? "First snapshot of the day captured."
    : cadenceMinutes != null && cadenceMinutes > expectedCadenceMinutes * 2
      ? `Snapshot cadence slipped to ${cadenceMinutes} minutes since prior capture.`
      : freshnessStale
        ? "Snapshot captured, but one or more upstream books were already stale."
        : `Snapshot cadence healthy at ${cadenceMinutes} minutes since prior capture.`;

  return {
    status,
    cadenceMinutes,
    expectedCadenceMinutes,
    summary,
  } as const;
}

function isReadonlyFsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("EROFS")
    || message.toLowerCase().includes("read-only")
    || message.includes("ENOENT: no such file or directory, mkdir '/var/task/");
}

function parseIsoTimestamp(value?: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = trimmed.length === 10 ? numeric * 1000 : numeric;
      const parsedEpoch = new Date(millis);
      return Number.isNaN(parsedEpoch.getTime()) ? null : parsedEpoch;
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toAgeMinutes(updatedAt: string | null, capturedAt: string) {
  const updated = parseIsoTimestamp(updatedAt);
  const captured = parseIsoTimestamp(capturedAt);
  if (!updated || !captured) return null;
  return Math.max(0, Math.round((captured.getTime() - updated.getTime()) / 60000));
}

function summarizeBooks(books: AggregatedBookOdds[], capturedAt: string): {
  sourceSummary: MarketSnapshotSourceSummary;
  freshness: SourceFreshnessSummary;
} {
  const uniqueBooks = Array.from(new Set(books.map((book) => book.book).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const ages: SourceAge[] = books
    .map((book) => ({
      updatedAt: book.lastUpdated,
      ageMinutes: toAgeMinutes(book.lastUpdated, capturedAt),
    }))
    .filter((entry): entry is SourceAge => Boolean(entry.updatedAt));

  const minAge = ages.length ? Math.min(...ages.map((entry) => entry.ageMinutes ?? Number.POSITIVE_INFINITY).filter(Number.isFinite)) : null;
  const maxAge = ages.length ? Math.max(...ages.map((entry) => entry.ageMinutes ?? Number.NEGATIVE_INFINITY).filter(Number.isFinite)) : null;
  const orderedUpdated = ages.map((entry) => entry.updatedAt).sort((a, b) => a.localeCompare(b));

  return {
    sourceSummary: {
      source: SOURCE_NAME,
      bookCount: uniqueBooks.length,
      books: uniqueBooks,
    },
    freshness: {
      sourceCount: books.length,
      staleSourceCount: ages.filter((entry) => (entry.ageMinutes ?? 0) > 30).length,
      oldestSourceUpdatedAt: orderedUpdated[0] ?? null,
      newestSourceUpdatedAt: orderedUpdated[orderedUpdated.length - 1] ?? null,
      minSourceAgeMinutes: Number.isFinite(minAge ?? Number.NaN) ? minAge : null,
      maxSourceAgeMinutes: Number.isFinite(maxAge ?? Number.NaN) ? maxAge : null,
    },
  };
}

function mergeFreshness(values: SourceFreshnessSummary[]): SourceFreshnessSummary {
  const valid = values.filter((value) => value.sourceCount > 0);
  if (!valid.length) {
    return {
      sourceCount: 0,
      staleSourceCount: 0,
      oldestSourceUpdatedAt: null,
      newestSourceUpdatedAt: null,
      minSourceAgeMinutes: null,
      maxSourceAgeMinutes: null,
    };
  }

  const oldest = valid
    .map((value) => value.oldestSourceUpdatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  const newest = valid
    .map((value) => value.newestSourceUpdatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  const minAgeValues = valid.map((value) => value.minSourceAgeMinutes).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxAgeValues = valid.map((value) => value.maxSourceAgeMinutes).filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    sourceCount: valid.reduce((sum, value) => sum + value.sourceCount, 0),
    staleSourceCount: valid.reduce((sum, value) => sum + value.staleSourceCount, 0),
    oldestSourceUpdatedAt: oldest[0] ?? null,
    newestSourceUpdatedAt: newest[newest.length - 1] ?? null,
    minSourceAgeMinutes: minAgeValues.length ? Math.min(...minAgeValues) : null,
    maxSourceAgeMinutes: maxAgeValues.length ? Math.max(...maxAgeValues) : null,
  };
}

function mergeSourceSummaries(values: MarketSnapshotSourceSummary[]): MarketSnapshotSourceSummary {
  const books = Array.from(new Set(values.flatMap((value) => value.books))).sort((a, b) => a.localeCompare(b));
  return {
    source: SOURCE_NAME,
    bookCount: books.length,
    books,
  };
}

function createPriceRecord(
  snapshotId: string,
  eventSnapshotId: string,
  event: AggregatedOdds,
  capturedAt: string,
  book: AggregatedBookOdds,
  marketType: MarketPriceMarketType,
  outcome: string,
  odds: number,
  line: number | null,
): MarketSnapshotPriceRecord {
  return {
    id: `${snapshotId}:${event.gameId}:${slugify(book.book)}:${marketType}:${slugify(outcome)}:${line ?? "na"}`,
    snapshotId,
    eventSnapshotId,
    sport: event.sport,
    gameId: event.gameId,
    oddsApiEventId: event.oddsApiEventId ?? null,
    commenceTime: event.commenceTime,
    capturedAt,
    book: book.book,
    marketType,
    outcome,
    odds,
    line,
    source: SOURCE_NAME,
    sourceUpdatedAt: book.lastUpdated || null,
    sourceAgeMinutes: toAgeMinutes(book.lastUpdated || null, capturedAt),
  };
}

function buildPriceRecords(snapshotId: string, eventSnapshotId: string, event: AggregatedOdds, capturedAt: string) {
  const prices: MarketSnapshotPriceRecord[] = [];

  for (const book of event.books) {
    if (typeof book.homeML === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "moneyline", event.homeTeam, book.homeML, null));
    }
    if (typeof book.awayML === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "moneyline", event.awayTeam, book.awayML, null));
    }
    if (typeof book.homeSpread === "number" && typeof book.homeSpreadOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "spread", event.homeTeam, book.homeSpreadOdds, book.homeSpread));
    }
    if (typeof book.awaySpread === "number" && typeof book.awaySpreadOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "spread", event.awayTeam, book.awaySpreadOdds, book.awaySpread));
    }
    if (typeof book.firstQuarterHomeSpread === "number" && typeof book.firstQuarterHomeSpreadOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "spread_q1", event.homeTeam, book.firstQuarterHomeSpreadOdds, book.firstQuarterHomeSpread));
    }
    if (typeof book.firstQuarterAwaySpread === "number" && typeof book.firstQuarterAwaySpreadOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "spread_q1", event.awayTeam, book.firstQuarterAwaySpreadOdds, book.firstQuarterAwaySpread));
    }
    if (typeof book.thirdQuarterHomeSpread === "number" && typeof book.thirdQuarterHomeSpreadOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "spread_q3", event.homeTeam, book.thirdQuarterHomeSpreadOdds, book.thirdQuarterHomeSpread));
    }
    if (typeof book.thirdQuarterAwaySpread === "number" && typeof book.thirdQuarterAwaySpreadOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "spread_q3", event.awayTeam, book.thirdQuarterAwaySpreadOdds, book.thirdQuarterAwaySpread));
    }
    if (typeof book.total === "number" && typeof book.overOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "total", "Over", book.overOdds, book.total));
    }
    if (typeof book.total === "number" && typeof book.underOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "total", "Under", book.underOdds, book.total));
    }
    if (typeof book.firstFiveHomeML === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "first_five_moneyline", event.homeTeam, book.firstFiveHomeML, null));
    }
    if (typeof book.firstFiveAwayML === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "first_five_moneyline", event.awayTeam, book.firstFiveAwayML, null));
    }
    if (typeof book.firstFiveTotal === "number" && typeof book.firstFiveOverOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "first_five_total", "Over", book.firstFiveOverOdds, book.firstFiveTotal));
    }
    if (typeof book.firstFiveTotal === "number" && typeof book.firstFiveUnderOdds === "number") {
      prices.push(createPriceRecord(snapshotId, eventSnapshotId, event, capturedAt, book, "first_five_total", "Under", book.firstFiveUnderOdds, book.firstFiveTotal));
    }
  }

  return prices;
}

function buildEventSnapshot(snapshotId: string, event: AggregatedOdds, capturedAt: string) {
  const eventSnapshotId = `${snapshotId}:${event.gameId}`;
  const metadata = summarizeBooks(event.books, capturedAt);
  const prices = buildPriceRecords(snapshotId, eventSnapshotId, event, capturedAt);

  const eventRecord: MarketSnapshotEventRecord = {
    id: eventSnapshotId,
    snapshotId,
    sport: event.sport,
    gameId: event.gameId,
    oddsApiEventId: event.oddsApiEventId ?? null,
    commenceTime: event.commenceTime,
    matchup: `${event.awayTeam} @ ${event.homeTeam}`,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    homeAbbrev: event.homeAbbrev,
    awayAbbrev: event.awayAbbrev,
    capturedAt,
    source: SOURCE_NAME,
    sourceSummary: metadata.sourceSummary,
    freshness: metadata.freshness,
    bookCount: metadata.sourceSummary.bookCount,
    priceCount: prices.length,
    bestPrices: {
      bestHome: event.bestHome,
      bestAway: event.bestAway,
      bestHomeSpread: event.bestHomeSpread,
      bestAwaySpread: event.bestAwaySpread,
      bestHomeFirstQuarterSpread: event.bestHomeFirstQuarterSpread,
      bestAwayFirstQuarterSpread: event.bestAwayFirstQuarterSpread,
      bestHomeThirdQuarterSpread: event.bestHomeThirdQuarterSpread,
      bestAwayThirdQuarterSpread: event.bestAwayThirdQuarterSpread,
      bestOver: event.bestOver,
      bestUnder: event.bestUnder,
    },
  };

  return { eventRecord, prices };
}

function buildEmptyDailyFile(date: string): DailyMarketSnapshotFile {
  return {
    date,
    snapshots: [],
  };
}

function normalizeDailyFile(date: string, parsed?: Partial<DailyMarketSnapshotFile> | null): DailyMarketSnapshotFile {
  if (!parsed || parsed.date !== date || !Array.isArray(parsed.snapshots)) {
    return buildEmptyDailyFile(date);
  }

  return {
    date,
    snapshots: parsed.snapshots,
  };
}

async function readDailySnapshotFile(date: string) {
  const cached = inMemoryDailySnapshots.get(date);
  if (cached) return normalizeDailyFile(date, cached);

  try {
    const raw = await readFile(getSnapshotFilePath(date), "utf8");
    const parsed = JSON.parse(raw) as Partial<DailyMarketSnapshotFile> | null;
    const normalized = normalizeDailyFile(date, parsed);
    inMemoryDailySnapshots.set(date, normalized);
    return normalized;
  } catch {
    const empty = buildEmptyDailyFile(date);
    inMemoryDailySnapshots.set(date, empty);
    return empty;
  }
}

async function persistDailySnapshotFile(file: DailyMarketSnapshotFile) {
  inMemoryDailySnapshots.set(file.date, file);
  const filePath = getSnapshotFilePath(file.date);

  try {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
    await writeFile(filePath, JSON.stringify(file, null, 2), "utf8");
    return {
      status: "persisted" as const,
      path: filePath,
    };
  } catch (error) {
    if (isReadonlyFsError(error)) {
      console.warn("[market-snapshot-store] filesystem snapshot archive unavailable, using in-memory fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "memory_fallback" as const,
        path: filePath,
      };
    }

    throw error;
  }
}

async function persistSnapshotToSupabase(snapshot: MarketSnapshotRecord) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      status: "skipped" as const,
    };
  }

  const baseHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  const snapshotRow = {
    id: snapshot.id,
    captured_at: snapshot.capturedAt,
    date_key: snapshot.dateKey,
    source: snapshot.source,
    trigger: snapshot.trigger,
    reason: snapshot.reason,
    storage_version: snapshot.storageVersion,
    sport_count: snapshot.sportCount,
    game_count: snapshot.gameCount,
    event_count: snapshot.eventCount,
    price_count: snapshot.priceCount,
    source_summary: snapshot.sourceSummary,
    freshness: snapshot.freshness,
    sport_breakdown: snapshot.sportBreakdown,
  };

  const eventRows = snapshot.events.map((event) => ({
    id: event.id,
    snapshot_id: event.snapshotId,
    sport: event.sport,
    game_id: event.gameId,
    odds_api_event_id: event.oddsApiEventId,
    commence_time: parseIsoTimestamp(event.commenceTime)?.toISOString() ?? null,
    matchup: event.matchup,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    home_abbrev: event.homeAbbrev,
    away_abbrev: event.awayAbbrev,
    captured_at: event.capturedAt,
    source: event.source,
    source_summary: event.sourceSummary,
    freshness: event.freshness,
    book_count: event.bookCount,
    price_count: event.priceCount,
    best_prices: event.bestPrices,
  }));

  const priceRows = snapshot.prices.map((price) => ({
    id: price.id,
    snapshot_id: price.snapshotId,
    event_snapshot_id: price.eventSnapshotId,
    sport: price.sport,
    game_id: price.gameId,
    odds_api_event_id: price.oddsApiEventId,
    commence_time: parseIsoTimestamp(price.commenceTime)?.toISOString() ?? null,
    captured_at: price.capturedAt,
    book: price.book,
    market_type: price.marketType,
    outcome: price.outcome,
    odds: price.odds,
    line: price.line,
    source: price.source,
    source_updated_at: parseIsoTimestamp(price.sourceUpdatedAt)?.toISOString() ?? null,
    source_age_minutes: price.sourceAgeMinutes,
    participant_type: price.participantType ?? null,
    participant_id: price.participantId ?? null,
    participant_name: price.participantName ?? null,
    opponent_name: price.opponentName ?? null,
    prop_type: price.propType ?? null,
    prop_market_key: price.propMarketKey ?? null,
    context: price.context ?? {},
  }));

  const parseSupabaseInsertError = async (response: Response, table: string) => {
    let details = "";

    try {
      const payload = await response.json() as {
        message?: string;
        error?: string;
        hint?: string;
        details?: string;
        code?: string;
      };
      details = [payload.code, payload.message || payload.error, payload.details, payload.hint]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" | ");
    } catch {
      // ignore malformed/non-json payloads
    }

    throw new Error(`${table} insert failed (${response.status})${details ? `: ${details}` : ""}`);
  };

  try {
    const snapshotResponse = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/market_snapshots`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(snapshotRow),
      cache: "no-store",
    });
    if (!snapshotResponse.ok) {
      await parseSupabaseInsertError(snapshotResponse, "market_snapshots");
    }

    if (eventRows.length) {
      const eventsResponse = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/market_snapshot_events`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(eventRows),
        cache: "no-store",
      });
      if (!eventsResponse.ok) {
        await parseSupabaseInsertError(eventsResponse, "market_snapshot_events");
      }
    }

    if (priceRows.length) {
      const pricesResponse = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/market_snapshot_prices`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(priceRows),
        cache: "no-store",
      });
      if (!pricesResponse.ok) {
        await parseSupabaseInsertError(pricesResponse, "market_snapshot_prices");
      }
    }

    return {
      status: "persisted" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function summarizeMarketSnapshotBoard(board: Partial<Record<AggregatedSport, AggregatedOdds[]>>, capturedAt = new Date().toISOString()) {
  const sports = Object.entries(board) as Array<[AggregatedSport, AggregatedOdds[] | undefined]>;
  const normalizedSports = sports.filter(([, events]) => Array.isArray(events));

  const sportBreakdown = Object.fromEntries(normalizedSports.map(([sport, events]) => {
    const validEvents = events ?? [];
    const metadata = validEvents.map((event) => summarizeBooks(event.books, capturedAt));
    const sourceSummary = mergeSourceSummaries(metadata.map((item) => item.sourceSummary));
    const freshness = mergeFreshness(metadata.map((item) => item.freshness));
    const priceCount = validEvents.reduce((sum, event) => sum + buildPriceRecords("preview", "preview", event, capturedAt).length, 0);

    return [sport, {
      gameCount: validEvents.length,
      bookCount: sourceSummary.bookCount,
      priceCount,
      sourceSummary,
      freshness,
    }];
  })) as Record<string, {
    gameCount: number;
    bookCount: number;
    priceCount: number;
    sourceSummary: MarketSnapshotSourceSummary;
    freshness: SourceFreshnessSummary;
  }>;

  const sourceSummary = mergeSourceSummaries(Object.values(sportBreakdown).map((entry) => entry.sourceSummary));
  const freshness = mergeFreshness(Object.values(sportBreakdown).map((entry) => entry.freshness));

  return {
    capturedAt,
    sportCount: Object.keys(sportBreakdown).length,
    gameCount: Object.values(sportBreakdown).reduce((sum, entry) => sum + entry.gameCount, 0),
    priceCount: Object.values(sportBreakdown).reduce((sum, entry) => sum + entry.priceCount, 0),
    sourceSummary,
    freshness,
    sportBreakdown,
  };
}

export function summarizeQuarterCoverage(snapshot: Pick<MarketSnapshotRecord, "events" | "prices">): QuarterCoverageSummary {
  const q1Prices = snapshot.prices.filter((price) => price.marketType === "spread_q1");
  const q3Prices = snapshot.prices.filter((price) => price.marketType === "spread_q3");
  const q1Games = new Set(q1Prices.map((price) => price.gameId));
  const q3Games = new Set(q3Prices.map((price) => price.gameId));
  const booksWithQ1 = Array.from(new Set(q1Prices.map((price) => price.book).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const booksWithQ3 = Array.from(new Set(q3Prices.map((price) => price.book).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  return {
    q1PriceCount: q1Prices.length,
    q3PriceCount: q3Prices.length,
    q1GameCount: q1Games.size,
    q3GameCount: q3Games.size,
    booksWithQ1,
    booksWithQ3,
  };
}

export async function normalizeMarketSnapshot({ board, capturedAt = new Date().toISOString(), trigger = "manual", reason = null }: CaptureOptions, existingSnapshots: MarketSnapshotRecord[] = []): Promise<MarketSnapshotRecord> {
  const dateKey = getDateKey(capturedAt);
  const snapshotId = `market-snapshot:${capturedAt}:${randomUUID().slice(0, 8)}`;
  const events = Object.values(board).flatMap((sportEvents) => sportEvents ?? []);
  const eventSnapshots = events.map((event) => buildEventSnapshot(snapshotId, event, capturedAt));
  const eventRecords = eventSnapshots.map((entry) => entry.eventRecord);
  const playerPropPriceRecords = await capturePlayerPropSnapshotRows({
    sportsBoard: board,
    snapshotId,
    eventSnapshotIdByGameId: new Map(eventRecords.map((event) => [event.gameId, event.id])),
    capturedAt,
  });
  const priceRecords = [...eventSnapshots.flatMap((entry) => entry.prices), ...playerPropPriceRecords];
  const metadata = summarizeMarketSnapshotBoard(board, capturedAt);
  const health = deriveSnapshotHealth(capturedAt, existingSnapshots);

  return {
    id: snapshotId,
    capturedAt,
    dateKey,
    source: SOURCE_NAME,
    trigger,
    reason,
    health,
    storageVersion: STORAGE_VERSION,
    sportCount: metadata.sportCount,
    gameCount: metadata.gameCount,
    eventCount: eventRecords.length,
    priceCount: priceRecords.length,
    sourceSummary: metadata.sourceSummary,
    freshness: metadata.freshness,
    sportBreakdown: metadata.sportBreakdown,
    quarterCoverage: summarizeQuarterCoverage({ events: eventRecords, prices: priceRecords }),
    events: eventRecords,
    prices: priceRecords,
  };
}

export async function captureMarketSnapshot(options: CaptureOptions): Promise<MarketSnapshotCaptureResult> {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const dailyFile = await readDailySnapshotFile(getDateKey(capturedAt));
  const snapshot = await normalizeMarketSnapshot({ ...options, capturedAt }, dailyFile.snapshots);
  const nextFile: DailyMarketSnapshotFile = {
    date: dailyFile.date,
    snapshots: [...dailyFile.snapshots, snapshot],
  };

  const file = await persistDailySnapshotFile(nextFile);
  const supabase = await persistSnapshotToSupabase(snapshot);

  const goose2Shadow = supabase.status === "persisted"
    ? await (async () => {
        try {
          const result = await bootstrapGoose2ShadowFromSnapshot(snapshot, false);
          return {
            status: "persisted" as const,
            counts: result.counts,
          };
        } catch (error) {
          return {
            status: "error" as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    : {
        status: "skipped" as const,
        error: supabase.status === "error" ? "Skipped Goose 2.0 shadow bootstrap because snapshot Supabase persistence failed." : undefined,
      };

  return {
    snapshot,
    quarterCoverage: summarizeQuarterCoverage(snapshot),
    persistence: {
      file,
      supabase,
      goose2Shadow,
    },
  };
}
