import { NextResponse } from "next/server";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import { getDateKey } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await getTodayNHLContextBoard();
    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json({
      date: getDateKey(),
      season: "unknown",
      builtAt: new Date().toISOString(),
      games: [],
      meta: {
        sources: {
          schedule: { provider: "nhl-api", fetchedAt: null },
          standings: { provider: "nhl-api", fetchedAt: null },
          moneyPuck: {
            provider: "unavailable",
            kind: "unavailable",
            upstream: "MoneyPuck",
            url: null,
            asOf: null,
            fetchedAt: null,
            teamCount: 0,
          },
        },
        notes: [
          "NHL context board failed to build for this request.",
          error instanceof Error ? error.message : "Unknown error",
        ],
      },
    }, { status: 200 });
  }
}
