import { NextResponse } from "next/server";
import { getAggregatedOddsBoard, filterAggregatedOddsToToday } from "@/lib/odds-aggregator";
import type { AggregatedOdds, AggregatedSport } from "@/lib/books/types";
import { getMarketHistoryRail } from "@/lib/market-snapshot-history";

export const dynamic = "force-dynamic";

function findGame(board: Partial<Record<AggregatedSport, AggregatedOdds[]>>, gameId: string) {
  return Object.values(board).flatMap((games) => filterAggregatedOddsToToday(games ?? [])).find((game) => game.gameId === gameId) ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");

  if (!gameId) {
    return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  }

  try {
    const board = await getAggregatedOddsBoard();
    const game = findGame(board, gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found on current board" }, { status: 404 });
    }

    const history = await getMarketHistoryRail(game);
    return NextResponse.json({ gameId, history });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "History unavailable" }, { status: 500 });
  }
}
