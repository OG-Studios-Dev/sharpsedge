import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AggregatedOdds } from "@/lib/books/types";
import type { MarketSnapshotEventRecord, MarketSnapshotRecord } from "@/lib/market-snapshot-store";

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
};

function getDateKey(iso: string) {
  return iso.slice(0, 10);
}

async function readDailySnapshots(dateKey: string): Promise<MarketSnapshotRecord[]> {
  try {
    const raw = await readFile(path.join(SNAPSHOT_DIR, `${dateKey}.json`), "utf8");
    const parsed = JSON.parse(raw) as Partial<DailyMarketSnapshotFile> | null;
    return Array.isArray(parsed?.snapshots) ? parsed!.snapshots as MarketSnapshotRecord[] : [];
  } catch {
    return [];
  }
}

function findEvent(snapshot: MarketSnapshotRecord, gameId: string): MarketSnapshotEventRecord | null {
  return snapshot.events.find((event) => event.gameId === gameId) ?? null;
}

function buildDeltaRecord(opening: MarketSnapshotRecord, latest: MarketSnapshotRecord, gameId: string): MarketHistoryDelta[] {
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
  const snapshots = await readDailySnapshots(getDateKey(game.commenceTime || new Date().toISOString()));
  const matching = snapshots.filter((snapshot) => findEvent(snapshot, game.gameId)).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (matching.length < 2) return null;

  const opening = matching[0];
  const latest = matching[matching.length - 1];
  const latestEvent = findEvent(latest, game.gameId);
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
    capturedSnapshots: matching.length,
    openingCapturedAt: opening.capturedAt,
    latestCapturedAt: latest.capturedAt,
    archiveStartedAt: opening.capturedAt,
    freshnessNote: latestEvent?.freshness.staleSourceCount
      ? `${latestEvent.freshness.staleSourceCount} latest source entr${latestEvent.freshness.staleSourceCount === 1 ? "y is" : "ies are"} older than 30 minutes.`
      : "Latest snapshot inputs are within the normal freshness window.",
    limitationNote: matching.length < 4
      ? "Snapshot archive is still shallow today, so treat this as opening-vs-latest context, not a full intraday chart."
      : "Snapshot archive is still same-day only here; this rail shows opening-to-latest context, not a long-term warehouse.",
    staleSourceCount: latestEvent?.freshness.staleSourceCount ?? 0,
    booksTracked,
    deltas,
  };
}
