import { NextRequest, NextResponse } from "next/server";
import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBEnrichmentBoard } from "@/lib/mlb-enrichment";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), MLB_TIME_ZONE);

  try {
    const board = await getMLBEnrichmentBoard(date);
    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json({
      boardDate: date,
      generatedAt: new Date().toISOString(),
      gamesCount: 0,
      games: [],
      error: error instanceof Error ? error.message : "MLB enrichment unavailable",
    }, { status: 500 });
  }
}
