import { NextResponse } from "next/server";
import {
  filterAggregatedOddsToToday,
  getAggregatedOddsBoard,
} from "@/lib/odds-aggregator";
import { summarizeMarketSnapshotBoard } from "@/lib/market-snapshot-store";
import { SUPPORTED_AGGREGATION_SPORTS, type AggregatedSport } from "@/lib/books/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await getAggregatedOddsBoard();
    const sports = Object.fromEntries(
      SUPPORTED_AGGREGATION_SPORTS.map((sport) => [
        sport,
        filterAggregatedOddsToToday(board[sport as AggregatedSport] || []),
      ]),
    ) as Record<AggregatedSport, ReturnType<typeof filterAggregatedOddsToToday>>;

    const generatedAt = new Date().toISOString();
    const snapshotMeta = summarizeMarketSnapshotBoard(sports, generatedAt);

    return NextResponse.json({
      generatedAt,
      sports,
      games: SUPPORTED_AGGREGATION_SPORTS.flatMap((sport) => sports[sport]),
      meta: {
        ttlMinutes: 15,
        sports: SUPPORTED_AGGREGATION_SPORTS,
        sourceSummary: snapshotMeta.sourceSummary,
        freshness: snapshotMeta.freshness,
        sportBreakdown: snapshotMeta.sportBreakdown,
      },
    });
  } catch {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sports: Object.fromEntries(
        SUPPORTED_AGGREGATION_SPORTS.map((sport) => [sport, []]),
      ),
      games: [],
      meta: {
        ttlMinutes: 15,
        sports: SUPPORTED_AGGREGATION_SPORTS,
        sourceSummary: {
          source: "aggregated_odds_board",
          bookCount: 0,
          books: [],
        },
        freshness: {
          sourceCount: 0,
          staleSourceCount: 0,
          oldestSourceUpdatedAt: null,
          newestSourceUpdatedAt: null,
          minSourceAgeMinutes: null,
          maxSourceAgeMinutes: null,
        },
        sportBreakdown: {},
      },
    }, { status: 500 });
  }
}
