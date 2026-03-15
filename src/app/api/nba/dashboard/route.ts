import { NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getNBADashboardData());
  } catch {
    return NextResponse.json({
      schedule: [],
      props: [],
      teamTrends: [],
      odds: [],
      meta: { league: "NBA", oddsConnected: false, gamesCount: 0, propsCount: 0, liveOnly: true },
    });
  }
}
