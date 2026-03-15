import { NextRequest, NextResponse } from "next/server";
import { getDateKey } from "@/lib/date-utils";
import { getGolfTournamentPicks } from "@/lib/golf-live-data";
import { persistPicksToSupabase } from "@/lib/persist-picks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey();

  try {
    const picks = await getGolfTournamentPicks(date);

    try {
      await persistPicksToSupabase(picks.map((pick) => ({ ...pick, league: "PGA" })));
    } catch (error) {
      console.warn("[api/golf/picks] failed to persist picks", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date });
  }
}
