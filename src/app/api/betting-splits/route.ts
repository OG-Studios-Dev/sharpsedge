/**
 * /api/betting-splits
 *
 * GET  ?sport=NBA&date=2026-03-29
 *      Returns the betting splits board for one sport.
 *      Includes DK (primary) + FD (comparison) splits, source attribution,
 *      fallback tracking, comparison agreement scores, and optional Covers supplement.
 *
 *      ?date defaults to today (ET).
 *      ?sport defaults to all covered sports (NBA/NHL/MLB/NFL) if omitted — returns an object keyed by sport.
 *
 *      Query params:
 *        sport:  "NBA" | "NHL" | "MLB" | "NFL" (optional, omit for all sports)
 *        date:   YYYY-MM-DD (optional, defaults to today ET)
 *        cached: "1" to try persisted snapshot before live fetch
 *        covers: "1" to include Covers.com consensus supplement (bets% only; requires extra HTML scrape)
 *
 * POST (no body)
 *      Triggers a live fetch + persist for all sports on the given date.
 *      Includes Covers supplement by default in POST (for full capture).
 *      Body (optional JSON): { date?: string, covers?: boolean }
 *
 * Source hierarchy:
 *   Primary:     Action Network Consensus (bookId=15, labelled "action-network-dk")
 *   Comparison:  Action Network Open (bookId=30, labelled "action-network-fd")
 *   Supplement:  Covers.com consensus (HTML scrape, bets%/tickets% only, no handle)
 *   Fallback:    FD data used when DK data missing for a game.
 *
 * Source blockers (confirmed 2026-03-29):
 *   - VSIN: Piano paywall — no public free splits API.
 *   - DraftKings direct: bookId=68 returns no splits via AN API; no JSON endpoint found.
 *   - SBR: TCP connection failure (unreachable from server).
 *   - Covers JSON: No JSON endpoint found; HTML scraping implemented instead.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getBettingSplits,
  getBettingSplitsCrossSport,
  computeSourceAgreement,
  mergeCoversData,
  type BettingSplitsSport,
  type BettingSplitsMarketType,
} from "@/lib/betting-splits";
import { getCoversSplits, getCoversSplitsCrossSport } from "@/lib/covers-splits";
import {
  saveBettingSplitsSnapshot,
  loadBettingSplitsSnapshot,
  loadBettingSplitsCrossSport,
} from "@/lib/betting-splits-store";

const COVERED_SPORTS: BettingSplitsSport[] = ["NBA", "NHL", "MLB", "NFL"];
const VALID_SPORTS = new Set<string>(COVERED_SPORTS);
const MARKETS: BettingSplitsMarketType[] = ["moneyline", "spread", "total"];

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function enrichBoardWithAgreement(board: ReturnType<typeof getBettingSplits> extends Promise<infer T> ? T : never) {
  return {
    ...board,
    games: board.games.map((g) => ({
      ...g,
      sourceAgreement: Object.fromEntries(
        MARKETS.map((mt) => [mt, computeSourceAgreement(g, mt)]),
      ),
    })),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sportParam = searchParams.get("sport")?.toUpperCase();
  const dateParam = searchParams.get("date") ?? todayET();
  const useCached = searchParams.get("cached") === "1";
  const includeCovers = searchParams.get("covers") === "1";

  // Validate date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  // Single-sport request
  if (sportParam) {
    if (!VALID_SPORTS.has(sportParam)) {
      return NextResponse.json(
        { error: `Unknown sport "${sportParam}". Covered: ${COVERED_SPORTS.join(", ")}` },
        { status: 400 },
      );
    }
    const sport = sportParam as BettingSplitsSport;

    if (useCached) {
      const persisted = await loadBettingSplitsSnapshot(sport, dateParam);
      if (persisted) {
        let board = persisted.board;
        if (includeCovers) {
          const coversResult = await getCoversSplits(sport);
          board = mergeCoversData(board, coversResult);
        }
        return NextResponse.json({
          ...enrichBoardWithAgreement(board),
          _meta: { fromCache: true, captureCount: persisted.captureCount, lastCapturedAt: persisted.lastCapturedAt },
        });
      }
    }

    let board = await getBettingSplits(sport, dateParam);
    if (includeCovers) {
      const coversResult = await getCoversSplits(sport);
      board = mergeCoversData(board, coversResult);
    }
    return NextResponse.json(enrichBoardWithAgreement(board));
  }

  // All-sports request
  if (useCached) {
    const persistedMap = await loadBettingSplitsCrossSport(dateParam);
    if (Object.keys(persistedMap).length > 0) {
      let coversMap: Record<string, Awaited<ReturnType<typeof getCoversSplits>>> | null = null;
      if (includeCovers) {
        const coversAll = await getCoversSplitsCrossSport();
        coversMap = coversAll as Record<string, Awaited<ReturnType<typeof getCoversSplits>>>;
      }
      const enriched = Object.fromEntries(
        Object.entries(persistedMap).map(([sport, day]) => {
          let board = day!.board;
          if (coversMap && coversMap[sport]) {
            board = mergeCoversData(board, coversMap[sport]);
          }
          return [
            sport,
            {
              ...enrichBoardWithAgreement(board),
              _meta: { fromCache: true, captureCount: day!.captureCount, lastCapturedAt: day!.lastCapturedAt },
            },
          ];
        }),
      );
      return NextResponse.json(enriched);
    }
  }

  let allBoards = await getBettingSplitsCrossSport(dateParam);
  if (includeCovers) {
    const coversAll = await getCoversSplitsCrossSport();
    const mergedBoards: typeof allBoards = {} as typeof allBoards;
    for (const sport of COVERED_SPORTS) {
      mergedBoards[sport] = mergeCoversData(allBoards[sport], coversAll[sport]);
    }
    allBoards = mergedBoards;
  }
  const enriched = Object.fromEntries(
    Object.entries(allBoards).map(([sport, board]) => [sport, enrichBoardWithAgreement(board)]),
  );
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  let date = todayET();
  let includeCovers = true; // default to true for POST (full capture)
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.covers === false) includeCovers = false;
    if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) date = body.date;
  } catch {
    // ignore parse errors
  }

  const sports = COVERED_SPORTS;

  // Fetch AN data for all sports, and optionally Covers in parallel
  const [anBoards, coversAllOrNull] = await Promise.all([
    Promise.all(sports.map((sport) => getBettingSplits(sport, date))),
    includeCovers ? getCoversSplitsCrossSport() : Promise.resolve(null),
  ]);

  // Merge Covers into AN boards if available
  const mergedBoards = sports.map((sport, i) => {
    let board = anBoards[i];
    if (coversAllOrNull) {
      board = mergeCoversData(board, coversAllOrNull[sport]);
    }
    return board;
  });

  const results = await Promise.all(
    mergedBoards.map((board) => saveBettingSplitsSnapshot(board)),
  );

  const persisted = results.filter((r) => r.status === "persisted").length;
  const errors = results.filter((r) => r.status === "error" || r.status === "memory_fallback");

  // Build Covers summary
  const coversSummary = coversAllOrNull
    ? Object.fromEntries(
        sports.map((sport) => [
          sport,
          {
            available: coversAllOrNull[sport].available,
            gamesWithSplits: coversAllOrNull[sport].gamesWithSplits,
            blocker: coversAllOrNull[sport].blocker,
          },
        ]),
      )
    : null;

  return NextResponse.json({
    capturedAt: new Date().toISOString(),
    date,
    includeCovers,
    sports: results,
    covers: coversSummary,
    summary: {
      total: results.length,
      persisted,
      errors: errors.length,
      gamesWithCoversSupplement: mergedBoards.reduce(
        (acc, b) => acc + (b.gamesWithCoversSupplement ?? 0),
        0,
      ),
    },
  });
}
