import { NextResponse } from "next/server";
import {
  filterAggregatedOddsToToday,
  getAggregatedOddsBoard,
} from "@/lib/odds-aggregator";
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

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sports,
      games: SUPPORTED_AGGREGATION_SPORTS.flatMap((sport) => sports[sport]),
      meta: {
        ttlMinutes: 15,
        sports: SUPPORTED_AGGREGATION_SPORTS,
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
      },
    }, { status: 500 });
  }
}
