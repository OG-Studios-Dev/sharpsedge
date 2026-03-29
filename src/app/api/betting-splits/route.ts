/**
 * /api/betting-splits
 *
 * GET  ?sport=NBA&date=2026-03-29
 *      Returns the betting splits board for one sport.
 *      Includes DK (primary) + FD (comparison) splits, source attribution,
 *      fallback tracking, and comparison agreement scores.
 *
 *      ?date defaults to today (ET).
 *      ?sport defaults to all covered sports (NBA/NHL/MLB/NFL) if omitted — returns an object keyed by sport.
 *
 *      Query params:
 *        sport: "NBA" | "NHL" | "MLB" | "NFL" (optional, omit for all sports)
 *        date:  YYYY-MM-DD (optional, defaults to today ET)
 *        cached: "1" to try persisted snapshot before live fetch
 *
 * POST (no body)
 *      Triggers a live fetch + persist for all sports on the given date.
 *      Useful for cron / admin refresh.
 *      Body (optional JSON): { date?: string }
 *
 * Source:      Action Network scoreboard API (no key required).
 * Primary:     DraftKings (bookId=15).
 * Comparison:  FanDuel (bookId=30).
 * Fallback:    FD data used when DK data is missing for a game.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getBettingSplits,
  getBettingSplitsCrossSport,
  computeSourceAgreement,
  type BettingSplitsSport,
  type BettingSplitsMarketType,
} from "@/lib/betting-splits";
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
        return NextResponse.json({
          ...enrichBoardWithAgreement(persisted.board),
          _meta: { fromCache: true, captureCount: persisted.captureCount, lastCapturedAt: persisted.lastCapturedAt },
        });
      }
    }

    const board = await getBettingSplits(sport, dateParam);
    return NextResponse.json(enrichBoardWithAgreement(board));
  }

  // All-sports request
  if (useCached) {
    const persistedMap = await loadBettingSplitsCrossSport(dateParam);
    if (Object.keys(persistedMap).length > 0) {
      const enriched = Object.fromEntries(
        Object.entries(persistedMap).map(([sport, day]) => [
          sport,
          {
            ...enrichBoardWithAgreement(day!.board),
            _meta: { fromCache: true, captureCount: day!.captureCount, lastCapturedAt: day!.lastCapturedAt },
          },
        ]),
      );
      return NextResponse.json(enriched);
    }
  }

  const allBoards = await getBettingSplitsCrossSport(dateParam);
  const enriched = Object.fromEntries(
    Object.entries(allBoards).map(([sport, board]) => [sport, enrichBoardWithAgreement(board)]),
  );
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  let date = todayET();
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) date = body.date;
  } catch {
    // ignore parse errors
  }

  const sports = COVERED_SPORTS;
  const results = await Promise.all(
    sports.map(async (sport) => {
      const board = await getBettingSplits(sport, date);
      return await saveBettingSplitsSnapshot(board);
    }),
  );

  const persisted = results.filter((r) => r.status === "persisted").length;
  const errors = results.filter((r) => r.status === "error" || r.status === "memory_fallback");

  return NextResponse.json({
    capturedAt: new Date().toISOString(),
    date,
    sports: results,
    summary: {
      total: results.length,
      persisted,
      errors: errors.length,
    },
  });
}
